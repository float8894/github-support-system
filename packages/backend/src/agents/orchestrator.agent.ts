import Anthropic from '@anthropic-ai/sdk';
import { env } from '../config/env.js';
import { AgentError } from '../errors/index.js';
import { logger } from '../lib/logger.js';
import { mcpClient } from '../lib/mcp-client.js';
import { retrieveChunks } from '../rag/retrieve.js';
import type {
  AgentType,
  CaseContext,
  CaseHistoryEvent,
  IssueCategory,
  OrgContext,
  SupportCase,
  ToolResult,
} from '../types/index.js';

const anthropic = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });
const log = logger.child({ agent: 'OrchestratorAgent' });

interface ClassificationResult {
  issueCategory: IssueCategory;
  routeTo: AgentType[];
}

const SYSTEM_PROMPT = `You are the OrchestratorAgent for GitHub Enterprise support.
Your job is to classify the incoming support case into exactly one issue category and
determine which specialist agents should handle it.

Issue categories:
- billing_plan: billing charges, plan upgrades/downgrades, subscription problems, payment failures
- entitlement: feature access, feature flags, feature not available on current plan
- auth_token: PAT failures, OAuth token issues, token expiry, token permissions
- saml_sso: SAML login failures, SSO configuration issues, certificate errors
- api_rate_limit: REST or GraphQL API rate limit errors, throttling, 429 responses
- ambiguous: unclear or multi-category — request clarification

Agent routing rules (routeTo array):
- billing_plan → ["BillingPlanAgent"]
- entitlement → ["EntitlementsAgent"]
- auth_token → ["AuthTokenAgent"]
- saml_sso → ["AuthTokenAgent"]
- api_rate_limit → ["ApiRateLimitAgent"]
- ambiguous → []

Return ONLY valid JSON with no markdown fences, matching exactly:
{
  "issueCategory": "<one of the categories above>",
  "routeTo": ["<AgentType>", ...]
}`;

export class OrchestratorAgent {
  private log = log;

  async run(caseInput: SupportCase): Promise<CaseContext> {
    this.log.info({ case_id: caseInput.case_id }, 'OrchestratorAgent started');

    try {
      const toolResults: ToolResult[] = [];

      // 1. Fetch org context via MCP
      const orgContextRaw = await mcpClient.callTool('get_org_context', {
        org_id: caseInput.org_id,
      });
      const orgContext = orgContextRaw as OrgContext;
      toolResults.push({
        tool_name: 'get_org_context',
        input: { org_id: caseInput.org_id },
        output: orgContext as unknown as Record<string, unknown>,
      });

      // 2. Fetch case history via MCP
      const caseHistoryRaw = await mcpClient.callTool('get_case_history', {
        customer_id: caseInput.customer_id,
        limit: 20,
      });
      const caseHistoryResult = caseHistoryRaw as {
        events: CaseHistoryEvent[];
        total_count: number;
      };
      toolResults.push({
        tool_name: 'get_case_history',
        input: { customer_id: caseInput.customer_id, limit: 20 },
        output: caseHistoryResult as unknown as Record<string, unknown>,
      });

      // 3. RAG retrieval
      const ragChunks = await retrieveChunks(caseInput.description, 5);
      this.log.info({ chunkCount: ragChunks.length }, 'RAG chunks retrieved');

      // 4. Classify via Claude
      const ragContext = ragChunks
        .map((c) => `[${c.chunk_id}] ${c.section_heading}\n${c.chunk_text}`)
        .join('\n\n');

      const userContent = `## Support Case
${JSON.stringify(caseInput, null, 2)}

## Org Context
${JSON.stringify(orgContext, null, 2)}

## Relevant Documentation
${ragContext}`;

      const response = await anthropic.messages.create({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 512,
        system: SYSTEM_PROMPT,
        messages: [{ role: 'user', content: userContent }],
      });

      const text = response.content
        .filter((b) => b.type === 'text')
        .map((b) => b.text)
        .join('');

      let classification: ClassificationResult;
      try {
        classification = JSON.parse(text) as ClassificationResult;
      } catch {
        throw new AgentError(
          `OrchestratorAgent failed to parse classification JSON: ${text}`,
          'OrchestratorAgent',
        );
      }

      this.log.info(
        {
          issueCategory: classification.issueCategory,
          routeTo: classification.routeTo,
        },
        'Case classified',
      );

      return {
        caseInput,
        orgContext,
        caseHistory: caseHistoryResult.events,
        ragChunks,
        issueCategory: classification.issueCategory,
        routeTo: classification.routeTo,
        toolResults,
        agentFindings: [],
      };
    } catch (err) {
      if (err instanceof AgentError) throw err;
      throw new AgentError(
        'OrchestratorAgent failed',
        'OrchestratorAgent',
        err,
      );
    }
  }
}
