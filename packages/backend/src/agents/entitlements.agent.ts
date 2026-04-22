import Anthropic from '@anthropic-ai/sdk';
import { env } from '../config/env.js';
import { AgentError } from '../errors/index.js';
import { logger } from '../lib/logger.js';
import { mcpClient } from '../lib/mcp-client.js';
import type {
  AgentFinding,
  CaseContext,
  Entitlement,
  Subscription,
  ToolResult,
} from '../types/index.js';

const anthropic = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });
const log = logger.child({ agent: 'EntitlementsAgent' });

const EXTRACT_SYSTEM_PROMPT = `You are extracting a feature name from a GitHub support case description.
Return ONLY a JSON object with no markdown fences:
{ "featureName": "<short_snake_case_feature_name>" }
Examples: "advanced_security", "actions", "packages", "copilot", "dependency_graph", "secret_scanning"`;

const ANALYSIS_SYSTEM_PROMPT = `You are the EntitlementsAgent for GitHub Enterprise support.
Analyse entitlement and subscription data to determine the root cause.

Logic rules:
- enabled=false AND source='plan_limit' → feature not included in current plan, recommend upgrade, verdict 'resolve'
- enabled=false AND source='admin_disabled' → admin has disabled the feature, direct them to enable it, verdict 'resolve'
- enabled=false AND source='not_found' → entitlement record missing, requires investigation, verdict 'escalate'
- enabled=true → feature should be accessible, look for other causes, verdict 'clarify'

Return ONLY valid JSON (no markdown fences):
{
  "summary": "<1-3 sentence finding>",
  "rootCauses": ["<cause1>"],
  "recommendedVerdict": "resolve" | "clarify" | "escalate"
}`;

export class EntitlementsAgent {
  private log = log;

  async run(context: CaseContext): Promise<AgentFinding> {
    this.log.info(
      { case_id: context.caseInput.case_id },
      'EntitlementsAgent started',
    );

    try {
      const toolResults: ToolResult[] = [];

      // 1. Extract feature name from case description via Claude
      const extractResponse = await anthropic.messages.create({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 128,
        system: EXTRACT_SYSTEM_PROMPT,
        messages: [{ role: 'user', content: context.caseInput.description }],
      });

      const extractText = extractResponse.content
        .filter((b) => b.type === 'text')
        .map((b) => b.text)
        .join('');

      let featureName = 'unknown_feature';
      try {
        const extracted = JSON.parse(extractText) as { featureName: string };
        featureName = extracted.featureName;
      } catch {
        this.log.warn(
          { raw: extractText },
          'Could not extract feature name, using fallback',
        );
      }

      this.log.info({ featureName }, 'Extracted feature name');

      // 2. Check entitlement
      const scopeType = context.orgContext.org.enterprise_id
        ? 'enterprise'
        : 'org';
      const scopeId =
        context.orgContext.org.enterprise_id ?? context.caseInput.org_id;

      const entitlementRaw = await mcpClient.callTool('check_entitlement', {
        scope_type: scopeType,
        scope_id: scopeId,
        feature_name: featureName,
      });
      const entitlement = entitlementRaw as Entitlement;
      toolResults.push({
        tool_name: 'check_entitlement',
        input: {
          scope_type: scopeType,
          scope_id: scopeId,
          feature_name: featureName,
        },
        output: entitlement as unknown as Record<string, unknown>,
      });

      // 3. Check subscription
      const subscriptionRaw = await mcpClient.callTool('check_subscription', {
        scope_type: scopeType,
        scope_id: scopeId,
      });
      const subscription = subscriptionRaw as Subscription;
      toolResults.push({
        tool_name: 'check_subscription',
        input: { scope_type: scopeType, scope_id: scopeId },
        output: subscription as unknown as Record<string, unknown>,
      });

      // Append to shared context
      context.toolResults.push(...toolResults);

      // 4. Call Claude to synthesize
      const ragContext = context.ragChunks
        .map((c) => `[${c.chunk_id}] ${c.section_heading}\n${c.chunk_text}`)
        .join('\n\n');

      const userContent = `## Support Case
${JSON.stringify(context.caseInput, null, 2)}

## Entitlement (feature: ${featureName})
${JSON.stringify(entitlement, null, 2)}

## Subscription
${JSON.stringify(subscription, null, 2)}

## Relevant Documentation
${ragContext}`;

      const response = await anthropic.messages.create({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 1024,
        system: ANALYSIS_SYSTEM_PROMPT,
        messages: [{ role: 'user', content: userContent }],
      });

      const text = response.content
        .filter((b) => b.type === 'text')
        .map((b) => b.text)
        .join('');

      let parsed: {
        summary: string;
        rootCauses: string[];
        recommendedVerdict: string;
      };
      try {
        parsed = JSON.parse(text) as typeof parsed;
      } catch {
        throw new AgentError(
          `EntitlementsAgent failed to parse LLM response: ${text}`,
          'EntitlementsAgent',
        );
      }

      const finding: AgentFinding = {
        agentName: 'EntitlementsAgent',
        summary: parsed.summary,
        rootCauses: parsed.rootCauses,
        recommendedVerdict:
          parsed.recommendedVerdict as AgentFinding['recommendedVerdict'],
        evidence: {
          docCitations: context.ragChunks,
          toolResults,
        },
      };

      this.log.info(
        { verdict: finding.recommendedVerdict },
        'EntitlementsAgent completed',
      );
      return finding;
    } catch (err) {
      if (err instanceof AgentError) throw err;
      throw new AgentError(
        'EntitlementsAgent failed',
        'EntitlementsAgent',
        err,
      );
    }
  }
}
