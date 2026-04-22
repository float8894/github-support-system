import Anthropic from '@anthropic-ai/sdk';
import { env } from '../config/env.js';
import { AgentError } from '../errors/index.js';
import { logger } from '../lib/logger.js';
import { mcpClient } from '../lib/mcp-client.js';
import { checkServiceStatus } from '../tools/service-status.tool.js';
import type {
  AgentFinding,
  ApiUsage,
  CaseContext,
  ToolResult,
} from '../types/index.js';

const anthropic = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });
const log = logger.child({ agent: 'ApiRateLimitAgent' });

const SYSTEM_PROMPT = `You are the ApiRateLimitAgent for GitHub Enterprise support.
Analyse API usage and service status data to determine the cause of rate limit or throttling issues.

Logic rules:
- If there are active incidents affecting API services → root cause is service-level incident, verdict 'resolve' with link to status page
- If throttled_requests > 0 in 1h window → customer is hitting rate limits, verdict 'resolve' with guidance on rate limit headers, backoff, and caching
- If throttled_requests > 0 in 24h window but not 1h → intermittent, verdict 'resolve' with monitoring guidance
- If request_count is very high → advise GraphQL API or conditional requests, verdict 'resolve'
- If no throttling detected → possible auth issue, verdict 'clarify'

Return ONLY valid JSON (no markdown fences):
{
  "summary": "<1-3 sentence finding>",
  "rootCauses": ["<cause1>"],
  "recommendedVerdict": "resolve" | "clarify" | "escalate"
}`;

export class ApiRateLimitAgent {
  private log = log;

  async run(context: CaseContext): Promise<AgentFinding> {
    this.log.info(
      { case_id: context.caseInput.case_id },
      'ApiRateLimitAgent started',
    );

    try {
      const toolResults: ToolResult[] = [];

      // 1. Check API usage for 1h window
      const usage1hRaw = await mcpClient.callTool('check_api_usage', {
        scope_id: context.caseInput.org_id,
        time_window: '1h',
      });
      const usage1h = usage1hRaw as { usages: ApiUsage[] };
      toolResults.push({
        tool_name: 'check_api_usage',
        input: { scope_id: context.caseInput.org_id, time_window: '1h' },
        output: usage1h as unknown as Record<string, unknown>,
      });

      // 2. Check API usage for 24h window
      const usage24hRaw = await mcpClient.callTool('check_api_usage', {
        scope_id: context.caseInput.org_id,
        time_window: '24h',
      });
      const usage24h = usage24hRaw as { usages: ApiUsage[] };
      toolResults.push({
        tool_name: 'check_api_usage',
        input: { scope_id: context.caseInput.org_id, time_window: '24h' },
        output: usage24h as unknown as Record<string, unknown>,
      });

      // 3. Check service status (direct tool — no MCP)
      const serviceStatus = await checkServiceStatus();
      toolResults.push({
        tool_name: 'check_service_status',
        input: {},
        output: serviceStatus as unknown as Record<string, unknown>,
      });

      // Append to shared context
      context.toolResults.push(...toolResults);

      // 4. Call Claude to synthesize
      const ragContext = context.ragChunks
        .map((c) => `[${c.chunk_id}] ${c.section_heading}\n${c.chunk_text}`)
        .join('\n\n');

      const userContent = `## Support Case
${JSON.stringify(context.caseInput, null, 2)}

## API Usage (1h window)
${JSON.stringify(usage1h, null, 2)}

## API Usage (24h window)
${JSON.stringify(usage24h, null, 2)}

## Service Status
Active incidents: ${serviceStatus.activeIncidents.length}
${JSON.stringify(serviceStatus, null, 2)}

## Relevant Documentation
${ragContext}`;

      const response = await anthropic.messages.create({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 1024,
        system: SYSTEM_PROMPT,
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
          `ApiRateLimitAgent failed to parse LLM response: ${text}`,
          'ApiRateLimitAgent',
        );
      }

      const finding: AgentFinding = {
        agentName: 'ApiRateLimitAgent',
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
        'ApiRateLimitAgent completed',
      );
      return finding;
    } catch (err) {
      if (err instanceof AgentError) throw err;
      throw new AgentError(
        'ApiRateLimitAgent failed',
        'ApiRateLimitAgent',
        err,
      );
    }
  }
}
