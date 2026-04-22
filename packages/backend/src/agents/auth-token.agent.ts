import Anthropic from '@anthropic-ai/sdk';
import { env } from '../config/env.js';
import { AgentError } from '../errors/index.js';
import { logger } from '../lib/logger.js';
import { mcpClient } from '../lib/mcp-client.js';
import type {
  AgentFinding,
  CaseContext,
  SamlConfig,
  TokenRecord,
  ToolResult,
} from '../types/index.js';

const anthropic = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });
const log = logger.child({ agent: 'AuthTokenAgent' });

const EXTRACT_SYSTEM_PROMPT = `You are extracting a token ID (UUID) from a GitHub support case.
If a UUID is present in the description, return it. If not, return null.
Return ONLY valid JSON (no markdown fences):
{ "tokenId": "<uuid>" | null }`;

const ANALYSIS_SYSTEM_PROMPT = `You are the AuthTokenAgent for GitHub Enterprise support.
Analyse token and SAML/SSO data to determine the root cause of an authentication failure.

Check in this exact order:
1. token.revoked = true → verdict 'resolve', instruct to generate a new token
2. token.expiration_date < now → verdict 'resolve', instruct to renew token
3. token.sso_authorized = false (org has SSO enabled) → verdict 'resolve', instruct SSO authorization
4. token.permissions missing required scope → verdict 'resolve', instruct adding required scope
5. SAML certificate_expiry < now → verdict 'escalate' (requires IdP cert renewal by admin)
6. Repeated history (≥3 same-category unresolved) → verdict 'escalate'
7. Otherwise → verdict 'resolve' with best available guidance

Return ONLY valid JSON (no markdown fences):
{
  "summary": "<1-3 sentence finding>",
  "rootCauses": ["<cause1>"],
  "recommendedVerdict": "resolve" | "clarify" | "escalate"
}`;

export class AuthTokenAgent {
  private log = log;

  async run(context: CaseContext): Promise<AgentFinding> {
    this.log.info(
      { case_id: context.caseInput.case_id },
      'AuthTokenAgent started',
    );

    try {
      const toolResults: ToolResult[] = [];

      // 1. Extract token ID from case description
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

      let tokenId: string | null = null;
      try {
        const extracted = JSON.parse(extractText) as { tokenId: string | null };
        tokenId = extracted.tokenId;
      } catch {
        this.log.warn({ raw: extractText }, 'Could not extract token ID');
      }

      // 2. Fetch token record if we have an ID
      let tokenRecord: TokenRecord | null = null;
      if (tokenId) {
        const tokenRaw = await mcpClient.callTool('get_token_record', {
          token_id: tokenId,
        });
        tokenRecord = tokenRaw as TokenRecord | null;
        toolResults.push({
          tool_name: 'get_token_record',
          input: { token_id: tokenId },
          output: (tokenRecord ?? {}) as Record<string, unknown>,
        });
        this.log.info(
          { tokenId, found: tokenRecord !== null },
          'Token record fetched',
        );
      }

      // 3. Fetch SAML config
      const samlRaw = await mcpClient.callTool('get_saml_config', {
        scope_id: context.caseInput.org_id,
        scope_type: 'org',
      });
      const samlConfig = samlRaw as SamlConfig | null;
      toolResults.push({
        tool_name: 'get_saml_config',
        input: { scope_id: context.caseInput.org_id, scope_type: 'org' },
        output: (samlConfig ?? {}) as Record<string, unknown>,
      });

      // 4. Check repeat history (already in context from OrchestratorAgent)
      const sameCategory = context.caseHistory.filter((e) => {
        // case_history events don't have issue_category directly, but the parent case might
        // We check event_type for patterns related to the current issueCategory
        return e.event_type === 'case_opened' || e.event_type === 'escalated';
      });
      const repeatCount = sameCategory.length;

      // Append to shared context
      context.toolResults.push(...toolResults);

      // 5. Call Claude to synthesize
      const ragContext = context.ragChunks
        .map((c) => `[${c.chunk_id}] ${c.section_heading}\n${c.chunk_text}`)
        .join('\n\n');

      const now = new Date().toISOString();
      const userContent = `## Support Case
${JSON.stringify(context.caseInput, null, 2)}

## Token Record
${tokenRecord ? JSON.stringify(tokenRecord, null, 2) : 'No token ID found in case description.'}

## SAML Config
${samlConfig ? JSON.stringify(samlConfig, null, 2) : 'No SAML config found.'}

## Case History (${context.caseHistory.length} events, same-pattern count: ${repeatCount})
${JSON.stringify(context.caseHistory.slice(0, 10), null, 2)}

## Current Timestamp
${now}

## SSO Enabled for Org
${context.orgContext.org.sso_enabled}

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
          `AuthTokenAgent failed to parse LLM response: ${text}`,
          'AuthTokenAgent',
        );
      }

      const finding: AgentFinding = {
        agentName: 'AuthTokenAgent',
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
        'AuthTokenAgent completed',
      );
      return finding;
    } catch (err) {
      if (err instanceof AgentError) throw err;
      throw new AgentError('AuthTokenAgent failed', 'AuthTokenAgent', err);
    }
  }
}
