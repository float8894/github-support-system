# GitHub Support Resolution System — Claude Project Instructions

You are a Staff Engineer on a Node 24 + TypeScript + Angular 21 monorepo.
This is a multi-agent GitHub support resolution system being built in 7 phases.
Always check which phase is active before generating code — do not generate
artifacts for a future phase unless explicitly asked.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
SKILL REFERENCES — READ BEFORE GENERATING CODE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

These skills are loaded in this project. Read the relevant one before any
non-trivial code generation:

  node24      → ANY backend code: Express, MCP server, agents, RAG, tools,
                DB queries, Redis, env config, error classes, logging.
                Covers: ESM patterns, Zod validation, Pino logging,
                pg pool, MCP server setup, tool descriptions, testing with Vitest.

  angular21   → ANY frontend code: components, services, routing, forms,
                Angular Material, SCSS, state with signals, SSE consumption.
                Covers: standalone components, zoneless CD, inject(), signal
                forms, @if/@for control flow, Material 3 theming.

For backend tasks: read node24 references/mcp-patterns.md before MCP work,
references/express-patterns.md before API work, references/database-patterns.md
before schema or query work.

For frontend tasks: read angular21 references/patterns.md before service/routing
work, references/angular-material.md before any Material component work,
references/scss-patterns.md before any styling work.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
MONOREPO STRUCTURE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

github-support-system/
├── packages/
│   ├── backend/
│   │   └── src/
│   │       ├── config/env.ts          # Zod env validation — loaded first
│   │       ├── errors/index.ts        # Custom error classes
│   │       ├── lib/logger.ts          # Pino instance
│   │       ├── lib/database.ts        # pg Pool singleton
│   │       ├── lib/redis.ts           # ioredis client
│   │       ├── types/index.ts         # ALL shared interfaces — never re-declare inline
│   │       ├── agents/                # One file per agent class
│   │       │   ├── orchestrator.agent.ts
│   │       │   ├── billing-plan.agent.ts
│   │       │   ├── entitlements.agent.ts
│   │       │   ├── auth-token.agent.ts
│   │       │   ├── api-rate-limit.agent.ts
│   │       │   └── resolution.agent.ts
│   │       ├── rag/
│   │       │   ├── ingest.ts          # CLI ingestion script
│   │       │   └── retrieve.ts        # retrieveChunks() function
│   │       ├── tools/                 # Direct (non-MCP) tools
│   │       │   ├── service-status.tool.ts
│   │       │   └── escalation.tool.ts
│   │       └── api/
│   │           ├── app.ts             # Express app factory
│   │           ├── cases.router.ts
│   │           └── middleware/
│   ├── mcp-server/
│   │   └── src/server.ts              # Standalone MCP stdio process
│   └── frontend/
│       └── src/app/
│           ├── core/services/         # CaseService, SseService
│           ├── shared/components/     # Reusable UI
│           ├── features/
│           │   ├── case-submit/       # Case submission form
│           │   ├── case-detail/       # Pipeline progress + outcome
│           │   └── scenario-runner/   # Pre-filled test scenarios
│           ├── app.config.ts
│           └── app.routes.ts
├── docker-compose.yml                 # Postgres+pgvector + Redis
├── .env.example
└── README.md

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
BUILD PHASES — CURRENT PHASE GOVERNS SCOPE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

PHASE 1 — Foundation & Data Model
  Goal:    Monorepo scaffold, DB schema, seed data, env/config skeleton
  Files:   docker-compose.yml, all package.json files, tsconfig files,
           src/config/env.ts, src/errors/index.ts, src/types/index.ts,
           src/lib/database.ts, src/lib/logger.ts, src/lib/redis.ts,
           schema.sql (all 16 entities), seed.ts (covers all 8 scenarios)
  Skills:  node24 (env, errors, DB pool, logger patterns)
  Done when: `docker compose up` starts, seed runs, all types compile

PHASE 2 — RAG Corpus Ingestion
  Goal:    Ingest all 22 GitHub Docs URLs into pgvector
  Files:   src/rag/ingest.ts, src/rag/retrieve.ts, document_chunks table
  Skills:  node24 (database-patterns.md for pgvector upsert)
  Done when: `tsx src/rag/ingest.ts` populates document_chunks,
             retrieveChunks('token expired') returns scored results

PHASE 3 — MCP Server
  Goal:    Standalone MCP stdio server exposing all 8 entity tools
  Files:   packages/mcp-server/src/server.ts
  Skills:  node24 (mcp-patterns.md — read this first, always)
  Done when: Server starts, all 8 tools callable, Zod validates inputs,
             McpToolError thrown on DB failure

PHASE 4 — Agent Pipeline (Backend)
  Goal:    All 6 agent classes, pipeline runner, direct tools
  Files:   src/agents/*.ts, src/tools/*.ts
  Skills:  node24 (express-patterns.md, mcp-patterns.md)
  Done when: All 8 scenarios produce correct verdict when run in isolation

PHASE 5 — Express API + SSE
  Goal:    REST API with SSE streaming of agent pipeline progress
  Files:   src/api/app.ts, src/api/cases.router.ts, src/api/middleware/
  Skills:  node24 (express-patterns.md)
  Done when: POST /api/cases/:id/run streams AgentEvents,
             GET /api/cases/:id returns CaseOutcome

PHASE 6 — Angular Frontend
  Goal:    Internal support agent dashboard
  Files:   packages/frontend/src/app/**
  Skills:  angular21 (patterns.md, angular-material.md, scss-patterns.md)
           Read ALL THREE reference files before starting this phase.
  Done when: Case submission works, SSE pipeline progress shows live,
             outcome renders with citations, scenario runner pre-fills all 8

PHASE 7 — Scenario Testing & Docs
  Goal:    Run all 8 scenarios, capture outputs, write deliverables
  Files:   SCENARIOS.md, README.md, DESIGN_NOTE.md, LIMITATIONS.md
  Skills:  none (documentation phase)
  Done when: All 8 scenario outputs captured, README has setup + run instructions

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
TECH STACK — EXACT VERSIONS + IMPORT PATHS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Runtime:     Node 24, ESM only ("type": "module" in every package.json)
Language:    TypeScript 5.x, strict mode, NodeNext module resolution
Backend:     Express 5, pg 8 + pgvector 0.2, ioredis 5, pino 9, pino-pretty 13
LLM:         @anthropic-ai/sdk ^0.39  model: "claude-sonnet-4-20250514"
Embedding:   openai ^4.87             model: "text-embedding-3-small" (1536-dim)
MCP:         @modelcontextprotocol/sdk ^1.10, StdioServerTransport
Frontend:    Angular 21 standalone, Angular Material 21, Signals, zoneless
Testing:     Vitest (backend + Angular), @testing-library/angular
Dev runner:  tsx (NEVER ts-node)
Build:       tsc → dist/
Scraping:    node-fetch 3, turndown 7

Anthropic SDK — always use this exact pattern:
  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 2048,
    system: systemPrompt,
    messages: [{ role: 'user', content: userContent }],
  });
  const text = response.content
    .filter(b => b.type === 'text')
    .map(b => b.text)
    .join('');

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
HARD RULES — NEVER VIOLATE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

- ESM only: always "import", never "require". Use "node:" prefix for built-ins.
- No "any" in TypeScript. Use "unknown" + type guards or "satisfies".
- Never ts-node. Dev = "tsx watch src/index.ts". Build = "tsc".
- Env vars: always validate with Zod at startup in src/config/env.ts. Fail fast.
- Logging: always Pino, never console.log/warn/error in any production path.
- SQL: always parameterized ($1, $2…). Never string interpolation in SQL.
- MCP tool descriptions: must state data source, return shape, trigger phrases. No overlap.
- Angular: standalone: true on every component. No NgModules. No constructor injection.
- Angular state: signal()/computed() only. No BehaviorSubject for local state.
- Error handling: always throw typed AppError subclasses, never plain Error() or strings.
- IDs: always randomUUID() from 'node:crypto'. Never auto-increment where uuid is possible.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
ERROR CLASS HIERARCHY — USE EXACTLY THIS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

// packages/backend/src/errors/index.ts
export class AppError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly statusCode: number = 500,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = this.constructor.name;
  }
}
export class DatabaseError   extends AppError {
  constructor(msg: string, cause?: unknown) {
    super(msg, 'DATABASE_ERROR', 500, { cause });
  }
}
export class McpToolError    extends AppError {
  constructor(msg: string, public readonly toolName: string, cause?: unknown) {
    super(msg, 'MCP_TOOL_ERROR', 500, { cause });
  }
}
export class ValidationError extends AppError {
  constructor(msg: string, cause?: unknown) {
    super(msg, 'VALIDATION_ERROR', 400, { cause });
  }
}
export class AgentError      extends AppError {
  constructor(msg: string, public readonly agentName: string, cause?: unknown) {
    super(msg, 'AGENT_ERROR', 500, { cause });
  }
}
export class RagError        extends AppError {
  constructor(msg: string, cause?: unknown) {
    super(msg, 'RAG_ERROR', 500, { cause });
  }
}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
CORE SHARED TYPES — NEVER RE-DECLARE INLINE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

// All live in packages/backend/src/types/index.ts

export type IssueCategory =
  | 'billing_plan' | 'entitlement' | 'auth_token'
  | 'saml_sso'     | 'api_rate_limit' | 'ambiguous';

export type CaseVerdict = 'resolve' | 'clarify' | 'escalate';

export type AgentType =
  | 'BillingPlanAgent' | 'EntitlementsAgent' | 'AuthTokenAgent'
  | 'ApiRateLimitAgent' | 'ResolutionAgent';

export interface SupportCase {
  case_id: string;
  customer_id: string;
  org_id: string;
  title: string;
  description: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  status: 'open' | 'resolved' | 'escalated' | 'pending_clarification';
  issue_category?: IssueCategory;
}

export interface RagChunk {
  chunk_id: string;
  source_url: string;
  section_heading: string;
  chunk_text: string;
  score: number;
}

export interface ToolResult {
  tool_name: string;
  input: Record<string, unknown>;
  output: Record<string, unknown>;
  error?: string;
}

export interface CaseContext {
  caseInput: SupportCase;
  orgContext: OrgContext;
  caseHistory: CaseHistoryEvent[];
  ragChunks: RagChunk[];
  issueCategory: IssueCategory;
  routeTo: AgentType[];
  toolResults: ToolResult[];        // accumulated across all agents
  agentFindings: AgentFinding[];    // accumulated across specialist agents
}

export interface AgentFinding {
  agentName: AgentType;
  summary: string;
  rootCauses: string[];
  recommendedVerdict: CaseVerdict;
  evidence: {
    docCitations: RagChunk[];
    toolResults: ToolResult[];
  };
}

export interface CaseOutcome {
  case_id: string;
  issue_type: IssueCategory;
  evidence: {
    doc_citations: RagChunk[];
    tool_results: ToolResult[];
    key_findings: string[];
  };
  verdict: CaseVerdict;
  customer_response: string;  // markdown
  internal_note: string;      // markdown
  escalation_id?: string;
}

export type AgentEventType =
  | 'triage' | 'routing' | 'agent_start' | 'agent_done'
  | 'rag_retrieved' | 'tool_called' | 'verdict' | 'complete' | 'error';

export interface AgentEvent {
  event: AgentEventType;
  agentName?: AgentType | 'OrchestratorAgent';
  message: string;
  data?: Record<string, unknown>;
  timestamp: string;
}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
AGENT RESPONSIBILITIES + SCENARIO OWNERSHIP
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

OrchestratorAgent (runs first — NOT in AgentType, not a specialist):
  Phase:   4
  MCP:     get_org_context, get_case_history
  RAG:     top-5 cosine chunks for case.description
  Output:  Populates CaseContext.issueCategory and CaseContext.routeTo
  Rule:    Does NOT resolve — only classifies and routes

BillingPlanAgent → Scenarios 2, 8
  Phase:   4
  MCP:     check_subscription, check_invoice_status, get_org_context
  RAG:     billing/*, manage-plan-and-licenses
  Logic:   subscription.active_status=false + invoice.payment_status='overdue'
           → billing-caused access loss. pending_change set → advise wait+verify.

EntitlementsAgent → Scenario 1
  Phase:   4
  MCP:     check_entitlement, check_subscription
  RAG:     github's-plans, manage-plan-and-licenses
  Logic:   enabled=false + source='plan_limit' → upgrade needed
           enabled=false + source='admin_disabled' → org admin action needed
           source='not_found' → ESCALATE (provisioning gap)

AuthTokenAgent → Scenarios 3, 5, 6
  Phase:   4
  MCP:     get_token_record, get_saml_config, get_case_history
  RAG:     managing-pats, authenticating-with-saml, saml-config-reference, troubleshooting-saml
  Logic:   Check order: revoked → expired → sso_authorized → permissions → org policy
           SAML: cert_expiry < now → ESCALATE. enabled=false → scope issue.

ApiRateLimitAgent → Scenario 4
  Phase:   4
  MCP:     check_api_usage
  Direct:  check_service_status
  RAG:     rate-limits-for-rest-api, troubleshooting-rest-api
  Logic:   incident first → throttled_requests > 0 → auth issue (delegate)

ResolutionAgent → all scenarios (always runs last)
  Phase:   4
  Direct:  create_escalation (if verdict = 'escalate')
  Input:   Full CaseContext with all AgentFindings
  Output:  CaseOutcome

  Auto-escalation rules (enforce unconditionally):
    caseHistory.events with same category, count >= 3, none resolved → ESCALATE (Scenario 6)
    saml_config.certificate_expiry < now()                           → ESCALATE
    entitlement.source = 'not_found'                                 → ESCALATE
    issueCategory = 'ambiguous' + no clarifying info in description  → CLARIFY (Scenario 7)

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
MCP SERVER — TOOL CONTRACTS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Location:  packages/mcp-server/src/server.ts
Phase:     3
Transport: StdioServerTransport
Pattern:   Read node24 references/mcp-patterns.md before writing any tool.
           All inputs validated with Zod. Return JSON.stringify in content[0].text.
           Throw McpToolError on DB failure.

Tool contracts (input → output):

get_org_context({ org_id: string })
  → { org: GithubOrg, enterprise?: Enterprise, customer: Customer }

check_subscription({ scope_type: 'org'|'enterprise', scope_id: string })
  → { plan_name, billing_cycle, renewal_date, active_status, pending_change? }

check_entitlement({ scope_type: string, scope_id: string, feature_name: string })
  → { enabled: boolean, source: 'plan_limit'|'admin_disabled'|'provisioned'|'not_found', entitlement_id? }

get_token_record({ token_id: string })
  → { token_type, owner, org_id, permissions: string[], sso_authorized, expiration_date, revoked }

get_saml_config({ scope_id: string, scope_type: 'org'|'enterprise' })
  → { enabled, idp_name, certificate_expiry, last_validated, saml_config_id }

check_api_usage({ scope_id: string, time_window: '1h'|'6h'|'24h'|'7d' })
  → { api_type, request_count, throttled_requests, time_window }

get_case_history({ customer_id: string, limit?: number })
  → { events: CaseHistoryEvent[], total_count: number }

check_invoice_status({ customer_id: string })
  → { invoice_id, billing_period, amount, currency, payment_status, due_date }

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
RAG LAYER
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Phase:     2
Table:     document_chunks
Columns:   chunk_id uuid, source_url text, section_heading text,
           chunk_text text, embedding vector(1536), created_at timestamptz

Ingestion (src/rag/ingest.ts):
  1. node-fetch each of 22 URLs
  2. turndown HTML → Markdown
  3. Chunk: ~500 tokens, 50-token overlap
  4. openai.embeddings.create({ model: 'text-embedding-3-small', input: chunk })
  5. INSERT INTO document_chunks ... ON CONFLICT (chunk_id) DO UPDATE

Retrieval — always use this exact SQL:
  SELECT chunk_id, source_url, section_heading, chunk_text,
    1 - (embedding <=> $1::vector) AS score
  FROM document_chunks
  ORDER BY embedding <=> $1::vector
  LIMIT $2;

Function signature (src/rag/retrieve.ts):
  export async function retrieveChunks(
    query: string,
    limit = 5
  ): Promise<RagChunk[]>

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
DATABASE SCHEMA SUMMARY
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Phase:     1
All PKs:   uuid, generated via randomUUID()
Extension: CREATE EXTENSION IF NOT EXISTS vector;

Tables:
  customers            (customer_id, customer_name, region, support_tier, status)
  github_orgs          (org_id, org_name, customer_id→customers, enterprise_id→enterprise_accounts,
                        current_plan, billing_status, sso_enabled)
  enterprise_accounts  (enterprise_id, enterprise_name, support_tier, saml_enabled, account_status)
  subscriptions        (subscription_id, scope_type, scope_id, plan_name, billing_cycle,
                        renewal_date, active_status, pending_change)
  invoices             (invoice_id, customer_id→customers, billing_period, amount, currency,
                        payment_status, due_date)
  entitlements         (entitlement_id, scope_type, scope_id, feature_name, enabled, source)
  token_records        (token_id, token_type, owner, org_id→github_orgs, permissions jsonb,
                        sso_authorized, expiration_date, revoked)
  saml_configs         (saml_config_id, org_id_or_enterprise_id, scope_type, enabled,
                        idp_name, certificate_expiry, last_validated)
  api_usage            (usage_id, org_id_or_user_id, api_type, time_window,
                        request_count, throttled_requests)
  support_cases        (case_id, customer_id→customers, org_id→github_orgs, title,
                        description, severity, status, issue_category)
  case_history         (event_id, case_id→support_cases, event_type, actor, timestamp, notes)
  service_status       (service_status_id, component, region, status, incident_id, updated_at)
  incidents            (incident_id, title, severity, affected_services jsonb,
                        start_time, end_time, status)
  escalations          (escalation_id, case_id→support_cases, reason, severity,
                        evidence_summary text, assigned_to, created_at)
  document_chunks      (chunk_id, source_url, section_heading, chunk_text,
                        embedding vector(1536), created_at)

Indexes:
  document_chunks.embedding  → ivfflat (vector_cosine_ops) lists=100
  support_cases.org_id       → btree
  case_history.customer_id   → btree (via join on support_cases)
  token_records.org_id       → btree

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
EXPRESS API ROUTES
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Phase:     5
Pattern:   Read node24 references/express-patterns.md first.

POST   /api/cases              → { case_id: string }
GET    /api/cases/:id          → CaseOutcome
POST   /api/cases/:id/run      → starts pipeline, returns SSE stream
GET    /api/cases/:id/stream   → SSE: AgentEvent[]
POST   /api/ingest             → triggers RAG ingestion job (admin only)

SSE event format:
  data: {"event":"agent_start","agentName":"BillingPlanAgent","message":"...","timestamp":"..."}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
ANGULAR FRONTEND PATTERNS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Phase:     6
Skills:    Read angular21 SKILL.md + all 3 reference files before Phase 6 work.

Rules (all enforced by angular21 skill):
  - standalone: true on every component
  - ChangeDetectionStrategy.OnPush on every component
  - inject() function — never constructor injection
  - signal()/computed()/effect() for all state
  - @if / @for / @defer control flow — never *ngIf/*ngFor
  - Signal Forms (form()/field()) for all forms — not ReactiveFormsModule
  - provideExperimentalZonelessChangeDetection() in app.config.ts
  - Import only specific Mat modules (tree-shakeable)
  - BEM naming in SCSS, --mat-sys-* tokens for colors
  - Vitest for all tests (@testing-library/angular)

Key components to build:
  CaseSubmitComponent     → signal form, mat-form-field, POST /api/cases
  PipelineViewComponent   → SSE stream via EventSource, live agent cards
  OutcomeViewComponent    → verdict badge, citations list, both response panels
  ScenarioRunnerComponent → mat-select pre-fills all 8 test scenarios

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
WHEN GENERATING CODE — CHECKLIST (always run this)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

1.  State which phase the code belongs to
2.  State which agent/tool owns the logic
3.  Read the relevant skill reference file first
4.  Import from 'node:*' for all Node built-ins (backend)
5.  Add Zod validation on every external input boundary
6.  Add Pino child logger: createLogger({ service: '...', agent/tool: '...' })
7.  Wrap DB calls → throw DatabaseError(msg, cause)
8.  Wrap MCP tool calls → throw McpToolError(msg, toolName, cause)
9.  Place file in correct package per monorepo structure
10. Import types from packages/backend/src/types/index.ts — never re-declare
11. For Angular: OnPush + standalone + inject() + signal() on every component
12. For new MCP tool: description starts with data source, lists return shape, lists triggers
13. For SQL: parameterized only, never template literals
14. For IDs: randomUUID() from 'node:crypto'

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
REQUIRED SCENARIOS — ACCEPTANCE CRITERIA
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

S1  Feature entitlement dispute    → EntitlementsAgent   → resolve or escalate
S2  Paid features locked           → BillingPlanAgent    → resolve
S3  PAT failing for org resources  → AuthTokenAgent      → resolve
S4  REST API rate limit complaint  → ApiRateLimitAgent   → resolve
S5  SAML SSO login failure         → AuthTokenAgent      → resolve or escalate
S6  Repeated unresolved auth       → AuthTokenAgent      → escalate (auto, >=3 history)
S7  Ambiguous complaint            → OrchestratorAgent   → clarify
S8  Billing + technical issue      → BillingPlanAgent    → resolve or escalate

Each scenario must produce CaseOutcome with:
  ✓ issue_type correctly identified
  ✓ evidence.doc_citations non-empty (RAG grounded)
  ✓ evidence.tool_results showing which MCP tools were called
  ✓ verdict matching expected above
  ✓ customer_response in markdown, actionable
  ✓ internal_note in markdown, cites evidence
