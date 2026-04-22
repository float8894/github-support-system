/**
 * Phase 4 end-to-end pipeline smoke test.
 * Tests OrchestratorAgent → specialist agent → ResolutionAgent against seeded cases.
 * Run: node --env-file=../../.env --import tsx/esm src/pipeline-test.ts
 */
import pg from 'pg';
import { ApiRateLimitAgent } from './agents/api-rate-limit.agent.js';
import { AuthTokenAgent } from './agents/auth-token.agent.js';
import { BillingPlanAgent } from './agents/billing-plan.agent.js';
import { EntitlementsAgent } from './agents/entitlements.agent.js';
import { OrchestratorAgent } from './agents/orchestrator.agent.js';
import { ResolutionAgent } from './agents/resolution.agent.js';
import { logger } from './lib/logger.js';
import { mcpClient } from './lib/mcp-client.js';
import type { AgentType, CaseContext, SupportCase } from './types/index.js';

const log = logger.child({ service: 'pipeline-test' });
const { Client } = pg;

const db = new Client({ connectionString: process.env['DATABASE_URL'] });
await db.connect();

// Fetch all seeded cases
const { rows: cases } = await db.query<SupportCase & { scenario?: string }>(
  `SELECT case_id, customer_id, org_id, title, description, severity, status, issue_category
   FROM support_cases ORDER BY title`,
);
await db.end();

log.info(`Running pipeline against ${cases.length} seeded cases`);

const orchestrator = new OrchestratorAgent();
const agents: Record<
  AgentType,
  { run: (ctx: CaseContext) => Promise<unknown> }
> = {
  BillingPlanAgent: new BillingPlanAgent(),
  EntitlementsAgent: new EntitlementsAgent(),
  AuthTokenAgent: new AuthTokenAgent(),
  ApiRateLimitAgent: new ApiRateLimitAgent(),
  ResolutionAgent: new ResolutionAgent(),
};
const resolution = new ResolutionAgent();

let passed = 0;
let failed = 0;

for (const c of cases) {
  const label = c.title;
  try {
    log.info({ case_id: c.case_id, title: c.title }, '--- Running case ---');

    // 1. Orchestrate
    const context = await orchestrator.run(c);
    log.info(
      { issueCategory: context.issueCategory, routeTo: context.routeTo },
      'Orchestration complete',
    );

    // 2. Run specialist agents
    for (const agentName of context.routeTo) {
      const agent = agents[agentName];
      if (!agent) continue;
      const finding = await (agent as BillingPlanAgent).run(context);
      context.agentFindings.push(finding as never);
      log.info(
        {
          agentName,
          verdict: (finding as { recommendedVerdict: string })
            .recommendedVerdict,
        },
        'Agent finding',
      );
    }

    // 3. Resolve
    const outcome = await resolution.run(context);

    log.info(
      {
        case_id: outcome.case_id,
        verdict: outcome.verdict,
        issue_type: outcome.issue_type,
        citations: outcome.evidence.doc_citations.length,
        tool_results: outcome.evidence.tool_results.length,
        escalation_id: outcome.escalation_id ?? null,
      },
      'OUTCOME',
    );

    // Validate shape
    if (!outcome.verdict) throw new Error('Missing verdict');
    if (!outcome.customer_response)
      throw new Error('Missing customer_response');
    if (!outcome.internal_note) throw new Error('Missing internal_note');
    if (outcome.evidence.doc_citations.length === 0)
      throw new Error('No RAG citations');

    console.log(`\nPASS [${label}]`);
    console.log(
      `  verdict: ${outcome.verdict} | issue: ${outcome.issue_type} | citations: ${outcome.evidence.doc_citations.length}`,
    );
    passed++;
  } catch (err) {
    console.error(
      `\nFAIL [${label}]: ${err instanceof Error ? err.message : String(err)}`,
    );
    failed++;
  }
}

await mcpClient.close();

console.log(`\n=== Pipeline Results: ${passed} passed, ${failed} failed ===`);
if (failed > 0) process.exit(1);
