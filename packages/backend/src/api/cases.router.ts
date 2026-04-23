import { Router, type Request, type Response } from 'express';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { ApiRateLimitAgent } from '../agents/api-rate-limit.agent.js';
import { AuthTokenAgent } from '../agents/auth-token.agent.js';
import { BillingPlanAgent } from '../agents/billing-plan.agent.js';
import { EntitlementsAgent } from '../agents/entitlements.agent.js';
import { OrchestratorAgent } from '../agents/orchestrator.agent.js';
import { ResolutionAgent } from '../agents/resolution.agent.js';
import { env } from '../config/env.js';
import { ValidationError } from '../errors/index.js';
import { query, queryOne } from '../lib/database.js';
import { logger } from '../lib/logger.js';
import { redis } from '../lib/redis.js';
import type {
  AgentEvent,
  AgentFinding,
  AgentType,
  CaseContext,
  CaseOutcome,
  SupportCase,
} from '../types/index.js';

const log = logger.child({ service: 'api', router: 'cases' });

// ─── Agent registry ───────────────────────────────────────────────────────────

const orchestrator = new OrchestratorAgent();
const resolution = new ResolutionAgent();
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

// ─── SSE helpers ──────────────────────────────────────────────────────────────

function setSseHeaders(res: Response): void {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
}

function buildEvent(
  event: AgentEvent['event'],
  message: string,
  extra?: Pick<AgentEvent, 'agentName' | 'data'>,
): AgentEvent {
  return {
    event,
    message,
    timestamp: new Date().toISOString(),
    ...extra,
  };
}

// ─── Pipeline runner ──────────────────────────────────────────────────────────

async function runPipeline(
  supportCase: SupportCase,
  emit: (event: AgentEvent) => void,
): Promise<CaseOutcome> {
  const caseId = supportCase.case_id;

  // 1. Triage
  emit(
    buildEvent('triage', 'Starting case analysis...', {
      agentName: 'OrchestratorAgent',
    }),
  );
  const context = await orchestrator.run(supportCase);

  // 2. Routing
  emit(
    buildEvent('routing', `Routing to: ${context.routeTo.join(', ')}`, {
      agentName: 'OrchestratorAgent',
      data: { issueCategory: context.issueCategory, routeTo: context.routeTo },
    }),
  );

  // 3. RAG retrieved
  if (context.ragChunks.length > 0) {
    emit(
      buildEvent(
        'rag_retrieved',
        `Retrieved ${context.ragChunks.length} document chunks`,
        {
          agentName: 'OrchestratorAgent',
          data: { count: context.ragChunks.length },
        },
      ),
    );
  }

  // 4. Specialist agents
  for (const agentName of context.routeTo) {
    if (agentName === 'ResolutionAgent') continue;
    const agent = specialistAgents[agentName as SpecialistAgentType];
    if (!agent) continue;

    emit(buildEvent('agent_start', `Starting ${agentName}...`, { agentName }));
    const finding = await agent.run(context);
    context.agentFindings.push(finding);
    emit(
      buildEvent(
        'agent_done',
        `${agentName} complete: ${finding.recommendedVerdict}`,
        {
          agentName,
          data: {
            recommendedVerdict: finding.recommendedVerdict,
            rootCauses: finding.rootCauses,
          },
        },
      ),
    );
  }

  // 5. Verdict synthesis
  emit(
    buildEvent('verdict', 'Synthesizing final verdict...', {
      agentName: 'OrchestratorAgent',
    }),
  );
  const outcome = await resolution.run(context);

  // 6. Persist outcome to Redis (24h TTL)
  const outcomeKey = `outcome:${caseId}`;
  const eventsKey = `events:${caseId}`;
  await redis.set(outcomeKey, JSON.stringify(outcome), 'EX', 86400);

  // 7. Update support_cases status + issue_category in DB
  const status: SupportCase['status'] =
    outcome.verdict === 'escalate'
      ? 'escalated'
      : outcome.verdict === 'clarify'
        ? 'pending_clarification'
        : 'resolved';

  await query(
    `UPDATE support_cases
     SET status = $1, issue_category = $2, updated_at = NOW()
     WHERE case_id = $3`,
    [status, outcome.issue_type, caseId],
  );

  // 8. Expire the events list at the same TTL
  await redis.expire(eventsKey, 86400);

  // 9. Complete event
  emit(
    buildEvent('complete', 'Case analysis complete', {
      agentName: 'OrchestratorAgent',
      data: {
        verdict: outcome.verdict,
        issue_type: outcome.issue_type,
        escalation_id: outcome.escalation_id ?? null,
      },
    }),
  );

  return outcome;
}

// ─── Router ───────────────────────────────────────────────────────────────────

export const casesRouter = Router();

// POST /api/cases — create a new support case
const createCaseSchema = z.object({
  customer_id: z.string().uuid(),
  org_id: z.string().uuid(),
  title: z.string().min(1).max(500),
  description: z.string().min(1),
  severity: z.enum(['low', 'medium', 'high', 'critical']),
});

casesRouter.post('/cases', async (req: Request, res: Response) => {
  const parseResult = createCaseSchema.safeParse(req.body);
  if (!parseResult.success) {
    throw new ValidationError('Invalid case input', parseResult.error);
  }

  const { customer_id, org_id, title, description, severity } =
    parseResult.data;
  const case_id = randomUUID();

  await query(
    `INSERT INTO support_cases
       (case_id, customer_id, org_id, title, description, severity, status)
     VALUES ($1, $2, $3, $4, $5, $6, 'open')`,
    [case_id, customer_id, org_id, title, description, severity],
  );

  log.info({ case_id }, 'Support case created');
  res.status(201).json({ case_id });
});

// GET /api/cases/:id — return stored CaseOutcome
casesRouter.get('/cases/:id', async (req: Request, res: Response) => {
  const { id } = req.params;
  const raw = await redis.get(`outcome:${id}`);
  if (!raw) {
    res
      .status(404)
      .json({ error: 'Case outcome not found', code: 'NOT_FOUND' });
    return;
  }
  res.json(JSON.parse(raw) as CaseOutcome);
});

// POST /api/cases/:id/run — run pipeline, stream AgentEvents via SSE
casesRouter.post('/cases/:id/run', async (req: Request, res: Response) => {
  const { id } = req.params;

  const supportCase = await queryOne<SupportCase>(
    `SELECT case_id, customer_id, org_id, title, description, severity, status, issue_category
     FROM support_cases WHERE case_id = $1`,
    [id],
  );

  if (!supportCase) {
    res.status(404).json({ error: 'Case not found', code: 'NOT_FOUND' });
    return;
  }

  setSseHeaders(res);
  res.flushHeaders();

  const eventsKey = `events:${id}`;

  function emit(event: AgentEvent): void {
    const line = `data: ${JSON.stringify(event)}\n\n`;
    res.write(line);
    // Store in Redis list for replay via GET /stream
    redis.rpush(eventsKey, JSON.stringify(event)).catch((err: unknown) => {
      log.warn({ err }, 'Failed to store SSE event in Redis');
    });
  }

  try {
    await runPipeline(supportCase, emit);
  } catch (err) {
    log.error({ err, case_id: id }, 'Pipeline error');
    const errorEvent = buildEvent(
      'error',
      err instanceof Error ? err.message : 'Pipeline failed',
    );
    res.write(`data: ${JSON.stringify(errorEvent)}\n\n`);
  } finally {
    res.end();
  }
});

// GET /api/cases/:id/stream — replay stored AgentEvents as SSE
casesRouter.get('/cases/:id/stream', async (req: Request, res: Response) => {
  const { id } = req.params;
  const stored = await redis.lrange(`events:${id}`, 0, -1);

  if (stored.length === 0) {
    res
      .status(404)
      .json({ error: 'No events found for this case', code: 'NOT_FOUND' });
    return;
  }

  setSseHeaders(res);
  res.flushHeaders();

  for (const raw of stored) {
    res.write(`data: ${raw}\n\n`);
  }

  res.end();
});

// GET /api/cases — list support cases (newest first, limit 50)
casesRouter.get('/cases', async (_req: Request, res: Response) => {
  const rows = await query<SupportCase>(
    `SELECT case_id, customer_id, org_id, title, description, severity, status, issue_category
     FROM support_cases
     ORDER BY created_at DESC
     LIMIT 50`,
    [],
  );
  res.json(rows);
});

// POST /api/ingest — admin-only RAG ingestion trigger
casesRouter.post('/ingest', async (req: Request, res: Response) => {
  const key = req.headers['x-admin-key'];
  if (key !== env.ADMIN_API_KEY) {
    res.status(401).json({ error: 'Unauthorized', code: 'UNAUTHORIZED' });
    return;
  }

  log.info('Starting RAG ingestion via API');

  // Respond immediately, run ingestion in background
  res.status(202).json({ message: 'Ingestion started' });

  try {
    const { ingestAll } = await import('../rag/ingest.js');
    const { totalChunks, failedUrls } = await ingestAll();
    log.info({ totalChunks, failedUrls }, 'RAG ingestion complete');
  } catch (err) {
    log.error({ err }, 'RAG ingestion failed');
  }
});
