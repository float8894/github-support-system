import Anthropic from '@anthropic-ai/sdk';
import { env } from '../config/env.js';
import { AgentError } from '../errors/index.js';
import { logger } from '../lib/logger.js';
import { mcpClient } from '../lib/mcp-client.js';
import type {
  AgentFinding,
  CaseContext,
  Invoice,
  Subscription,
  ToolResult,
} from '../types/index.js';

const anthropic = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });
const log = logger.child({ agent: 'BillingPlanAgent' });

const SYSTEM_PROMPT = `You are the BillingPlanAgent for GitHub Enterprise support.
Analyse billing and subscription data to determine the root cause of the support case.

Logic rules:
- If subscription.active_status is false AND invoice.payment_status is 'overdue' → root cause is billing-caused access loss, verdict is 'resolve' with clear payment instructions
- If subscription.active_status is false but invoice is paid → possible plan provisioning issue, verdict is 'escalate'
- If subscription is active but features are missing → check plan limits, verdict is 'resolve' with upgrade guidance
- If enterprise subscription differs from org subscription → surface the conflict

Return ONLY valid JSON matching this schema (no markdown fences):
{
  "summary": "<1-3 sentence finding>",
  "rootCauses": ["<cause1>", "<cause2>"],
  "recommendedVerdict": "resolve" | "clarify" | "escalate"
}`;

export class BillingPlanAgent {
  private log = log;

  async run(context: CaseContext): Promise<AgentFinding> {
    this.log.info(
      { case_id: context.caseInput.case_id },
      'BillingPlanAgent started',
    );

    try {
      const toolResults: ToolResult[] = [];

      // 1. Check org subscription
      const orgSubRaw = await mcpClient.callTool('check_subscription', {
        scope_type: 'org',
        scope_id: context.caseInput.org_id,
      });
      const orgSubscription = orgSubRaw as Subscription;
      toolResults.push({
        tool_name: 'check_subscription',
        input: { scope_type: 'org', scope_id: context.caseInput.org_id },
        output: orgSubscription as unknown as Record<string, unknown>,
      });

      // 2. Check enterprise subscription if applicable
      let enterpriseSubscription: Subscription | null = null;
      if (context.orgContext.org.enterprise_id) {
        const entSubRaw = await mcpClient.callTool('check_subscription', {
          scope_type: 'enterprise',
          scope_id: context.orgContext.org.enterprise_id,
        });
        enterpriseSubscription = entSubRaw as Subscription;
        toolResults.push({
          tool_name: 'check_subscription',
          input: {
            scope_type: 'enterprise',
            scope_id: context.orgContext.org.enterprise_id,
          },
          output: enterpriseSubscription as unknown as Record<string, unknown>,
        });
      }

      // 3. Check invoice status
      const invoiceRaw = await mcpClient.callTool('check_invoice_status', {
        customer_id: context.caseInput.customer_id,
      });
      const invoice = invoiceRaw as Invoice;
      toolResults.push({
        tool_name: 'check_invoice_status',
        input: { customer_id: context.caseInput.customer_id },
        output: invoice as unknown as Record<string, unknown>,
      });

      // Append to shared context tool results
      context.toolResults.push(...toolResults);

      // 4. Call Claude to synthesize findings
      const ragContext = context.ragChunks
        .map((c) => `[${c.chunk_id}] ${c.section_heading}\n${c.chunk_text}`)
        .join('\n\n');

      const userContent = `## Support Case
${JSON.stringify(context.caseInput, null, 2)}

## Org Subscription
${JSON.stringify(orgSubscription, null, 2)}

${enterpriseSubscription ? `## Enterprise Subscription\n${JSON.stringify(enterpriseSubscription, null, 2)}\n` : ''}
## Invoice Status
${JSON.stringify(invoice, null, 2)}

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
          `BillingPlanAgent failed to parse LLM response: ${text}`,
          'BillingPlanAgent',
        );
      }

      const finding: AgentFinding = {
        agentName: 'BillingPlanAgent',
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
        'BillingPlanAgent completed',
      );
      return finding;
    } catch (err) {
      if (err instanceof AgentError) throw err;
      throw new AgentError('BillingPlanAgent failed', 'BillingPlanAgent', err);
    }
  }
}
