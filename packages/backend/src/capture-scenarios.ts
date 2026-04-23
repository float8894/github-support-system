/**
 * Phase 7 scenario capture script.
 * Runs the full agent pipeline against all seeded cases and writes
 * detailed CaseOutcome results to scenarios-output.json at repo root.
 *
 * Run: npm run scenarios:capture -w packages/backend
 * Requires: docker compose up -d, MCP server running, RAG ingested
 */
import { writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { ApiRateLimitAgent } from './agents/api-rate-limit.agent.js';
import { AuthTokenAgent } from './agents/auth-token.agent.js';
import { BillingPlanAgent } from './agents/billing-plan.agent.js';
import { EntitlementsAgent } from './agents/entitlements.agent.js';
import { OrchestratorAgent } from './agents/orchestrator.agent.js';
import { ResolutionAgent } from './agents/resolution.agent.js';
import { logger } from './lib/logger.js';
import { mcpClient } from './lib/mcp-client.js';
import type {
  AgentFinding,
  AgentType,
  CaseContext,
  CaseOutcome,
  SupportCase,
} from './types/index.js';

const log = logger.child({ service: 'capture-scenarios' });
const { Client } = pg;

// ─── DB: fetch all seeded cases ordered by their scenario number in title ─────

const db = new Client({ connectionString: process.env['DATABASE_URL'] });
await db.connect();

const { rows: cases } = await db.query<SupportCase>(
  `SELECT case_id, customer_id, org_id, title, description, severity, status, issue_category
   FROM support_cases
   ORDER BY title`,
);
await db.end();

log.info({ count: cases.length }, 'Loaded seeded cases');

// ─── Agent registry ───────────────────────────────────────────────────────────

const orchestrator = new OrchestratorAgent();
type SpecialistAgentType = Exclude<AgentType, 'ResolutionAgent'>;
const specialistAgents: Record<
  SpecialistAgentType,
  { run: (ctx: CaseContext) => Promise<AgentFinding> }
> = {
  BillingPlanAgent: new BillingPlanAgent(),
  EntitlementsAgent: new EntitlementsAgent(),
  AuthTokenAgent: new AuthTokenAgent(),
  ApiRateLimitAgent: new ApiRateLimitAgent(),
};
const resolution = new ResolutionAgent();

// ─── Capture results ──────────────────────────────────────────────────────────

interface ScenarioCapture {
  case_id: string;
  title: string;
  description: string;
  severity: string;
  issue_category_seeded: string | null | undefined;
  orchestration: {
    issue_category: string;
    route_to: string[];
  };
  specialist_findings: Array<{
    agent: string;
    summary: string;
    root_causes: string[];
    recommended_verdict: string;
    tool_results_count: number;
  }>;
  outcome: CaseOutcome;
  passed: boolean;
  error?: string;
}

const captures: ScenarioCapture[] = [];
let passed = 0;
let failed = 0;

for (const c of cases) {
  log.info({ case_id: c.case_id, title: c.title }, 'Running case');
  const capture: ScenarioCapture = {
    case_id: c.case_id,
    title: c.title,
    description: c.description,
    severity: c.severity,
    issue_category_seeded: c.issue_category,
    orchestration: { issue_category: '', route_to: [] },
    specialist_findings: [],
    outcome: {} as CaseOutcome,
    passed: false,
  };

  try {
    // 1. Orchestrate: triage + RAG + routing
    const context = await orchestrator.run(c);
    capture.orchestration = {
      issue_category: context.issueCategory,
      route_to: context.routeTo,
    };

    // 2. Specialist agents
    for (const agentName of context.routeTo) {
      if (agentName === 'ResolutionAgent') continue;
      const agent = specialistAgents[agentName as SpecialistAgentType];
      if (!agent) continue;
      const finding = await agent.run(context);
      context.agentFindings.push(finding);
      capture.specialist_findings.push({
        agent: agentName,
        summary: finding.summary,
        root_causes: finding.rootCauses,
        recommended_verdict: finding.recommendedVerdict,
        tool_results_count: finding.evidence.toolResults.length,
      });
    }

    // 3. Resolution
    const outcome = await resolution.run(context);

    // Validate required shape
    if (!outcome.verdict) throw new Error('outcome.verdict is missing');
    if (!outcome.customer_response)
      throw new Error('outcome.customer_response is missing');
    if (!outcome.internal_note)
      throw new Error('outcome.internal_note is missing');
    if (outcome.evidence.doc_citations.length === 0)
      throw new Error('outcome.evidence.doc_citations is empty');

    capture.outcome = outcome;
    capture.passed = true;
    passed++;

    log.info(
      {
        case_id: outcome.case_id,
        verdict: outcome.verdict,
        issue_type: outcome.issue_type,
        citations: outcome.evidence.doc_citations.length,
        tool_results: outcome.evidence.tool_results.length,
        escalation_id: outcome.escalation_id ?? null,
      },
      'PASS',
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    capture.error = msg;
    log.error({ case_id: c.case_id, error: msg }, 'FAIL');
    failed++;
  }

  captures.push(capture);
}

await mcpClient.close();

// ─── Write output ─────────────────────────────────────────────────────────────

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const outputPath = resolve(__dirname, '../../../scenarios-output.json');

await writeFile(outputPath, JSON.stringify(captures, null, 2), 'utf8');

log.info({ outputPath, passed, failed }, 'Scenario capture complete');

console.log(`\n=== Capture Results: ${passed} passed, ${failed} failed ===`);
console.log(`Output written to: ${outputPath}`);

if (failed > 0) process.exit(1);
