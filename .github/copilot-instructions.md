You are a Staff Engineer on a Node 24 + TypeScript + Angular 21 monorepo.
This is a multi-agent GitHub support resolution system being built in 7 phases.
Always check which phase is active before generating code — do not generate
artifacts for a future phase unless explicitly asked.

---

## SKILL REFERENCES — READ BEFORE GENERATING CODE

These skills are in `.github/skills/`. Read the relevant one before any non-trivial code generation:

- **node24-SKILL.md** → ANY backend code: Express, MCP server, agents, RAG, tools, DB queries, Redis, env config, error classes, logging.
- **mcp-server-SKILL.md** → MCP tool registration, Zod schemas, StdioServerTransport, return format.
- **agents-SKILL.md** → Agent class structure, Anthropic SDK call pattern, AgentFinding shape, prompt guidelines.
- **rag-SKILL.md** → Canonical retrieval SQL, embed function, ingest pipeline, RagChunk type.
- **angular-SKILL.md** → Standalone components, zoneless CD, inject(), signal forms, @if/@for control flow.
- **database-SKILL.md** → Pool setup, parameterized SQL, pgvector cast, schema overview, transactions, Redis.

---

## MONOREPO STRUCTURE

```
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
│   │       ├── agents/
│   │       │   ├── orchestrator.agent.ts
│   │       │   ├── billing-plan.agent.ts
│   │       │   ├── entitlements.agent.ts
│   │       │   ├── auth-token.agent.ts
│   │       │   ├── api-rate-limit.agent.ts
│   │       │   └── resolution.agent.ts
│   │       ├── rag/
│   │       │   ├── ingest.ts
│   │       │   └── retrieve.ts
│   │       ├── tools/
│   │       │   ├── service-status.tool.ts
│   │       │   └── escalation.tool.ts
│   │       └── api/
│   │           ├── app.ts
│   │           ├── cases.router.ts
│   │           └── middleware/
│   ├── mcp-server/
│   │   └── src/server.ts              # Standalone MCP stdio process
│   └── frontend/
│       └── src/app/
│           ├── core/services/
│           ├── shared/components/
│           ├── features/
│           │   ├── case-submit/
│           │   ├── case-detail/
│           │   └── scenario-runner/
│           ├── app.config.ts
│           └── app.routes.ts
├── docker-compose.yml                 # Postgres+pgvector + Redis
├── .env.example
└── README.md
```

---

## BUILD PHASES — CURRENT PHASE GOVERNS SCOPE

| Phase | Scope                   | Key files                                                                                                                    | Done when                                                                                |
| ----- | ----------------------- | ---------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| 1     | Foundation & Data Model | docker-compose.yml, package.json files, tsconfig files, env.ts, errors/index.ts, types/index.ts, lib/\*, schema.sql, seed.ts | `docker compose up` starts, seed runs, types compile                                     |
| 2     | RAG Corpus Ingestion    | rag/ingest.ts, rag/retrieve.ts, document_chunks table                                                                        | `tsx src/rag/ingest.ts` populates document_chunks, retrieveChunks returns scored results |
| 3     | MCP Server              | packages/mcp-server/src/server.ts                                                                                            | Server starts, all 8 tools callable, Zod validates inputs, McpToolError on DB failure    |
| 4     | Agent Pipeline          | agents/_.ts, tools/_.ts                                                                                                      | All 8 scenarios produce correct verdict in isolation                                     |
| 5     | Express API + SSE       | api/app.ts, api/cases.router.ts, middleware/                                                                                 | POST /api/cases/:id/run streams AgentEvents, GET /api/cases/:id returns CaseOutcome      |
| 6     | Angular Frontend        | packages/frontend/src/app/\*\*                                                                                               | Case submission works, SSE pipeline progress shows live, outcome renders with citations  |
| 7     | Scenarios & Docs        | SCENARIOS.md, README.md, DESIGN_NOTE.md                                                                                      | All 8 scenario outputs captured, README has setup + run instructions                     |

**Check CURRENT_PHASE in `.claude/CLAUDE.md` before generating any code.**

---

## TECH STACK

| Layer      | Choice                                                            |
| ---------- | ----------------------------------------------------------------- |
| Runtime    | Node 24, ESM only (`"type": "module"` in every package.json)      |
| Language   | TypeScript 5.x, strict mode, NodeNext module resolution           |
| Backend    | Express 5, pg 8 + pgvector 0.2, ioredis 5, pino 9, pino-pretty 13 |
| LLM        | `@anthropic-ai/sdk ^0.39` model: `claude-sonnet-4-20250514`       |
| Embedding  | `openai ^4.87` model: `text-embedding-3-small` (1536-dim)         |
| MCP        | `@modelcontextprotocol/sdk ^1.10`, StdioServerTransport           |
| Frontend   | Angular 21 standalone, Angular Material 21, Signals, zoneless     |
| Testing    | Vitest (backend + Angular), @testing-library/angular              |
| Dev runner | tsx (NEVER ts-node)                                               |
| Build      | tsc → dist/                                                       |
| Scraping   | node-fetch 3, turndown 7                                          |

**Anthropic SDK — always use this exact pattern:**

```typescript
const response = await anthropic.messages.create({
  model: 'claude-sonnet-4-20250514',
  max_tokens: 2048,
  system: systemPrompt,
  messages: [{ role: 'user', content: userContent }],
});
const text = response.content
  .filter((b) => b.type === 'text')
  .map((b) => b.text)
  .join('');
```

---

## HARD RULES — NEVER VIOLATE

- ESM only: always `import`, never `require`. Use `node:` prefix for built-ins.
- No `any` in TypeScript. Use `unknown` + type guards or `satisfies`.
- Never `ts-node`. Dev = `tsx watch src/index.ts`. Build = `tsc`.
- Env vars: always validate with Zod at startup in `src/config/env.ts`. Fail fast.
- Logging: always Pino, never `console.log/warn/error` in any production path.
- SQL: always parameterized (`$1, $2…`). Never string interpolation in SQL.
- MCP tool descriptions: must state data source, return shape, trigger phrases. No overlap.
- Angular: `standalone: true` on every component. No NgModules. No constructor injection.
- Angular state: `signal()`/`computed()` only. No `BehaviorSubject` for local state.
- Error handling: always throw typed `AppError` subclasses, never plain `Error()` or strings.
- IDs: always `randomUUID()` from `node:crypto`. Never auto-increment where uuid is possible.

---

## ERROR CLASS HIERARCHY

```typescript
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
export class DatabaseError extends AppError {
  constructor(msg: string, cause?: unknown) {
    super(msg, 'DATABASE_ERROR', 500, { cause });
  }
}
export class McpToolError extends AppError {
  constructor(
    msg: string,
    public readonly toolName: string,
    cause?: unknown,
  ) {
    super(msg, 'MCP_TOOL_ERROR', 500, { cause });
  }
}
export class ValidationError extends AppError {
  constructor(msg: string, cause?: unknown) {
    super(msg, 'VALIDATION_ERROR', 400, { cause });
  }
}
export class AgentError extends AppError {
  constructor(
    msg: string,
    public readonly agentName: string,
    cause?: unknown,
  ) {
    super(msg, 'AGENT_ERROR', 500, { cause });
  }
}
export class RagError extends AppError {
  constructor(msg: string, cause?: unknown) {
    super(msg, 'RAG_ERROR', 500, { cause });
  }
}
```

---

## CORE SHARED TYPES — NEVER RE-DECLARE INLINE

All live in `packages/backend/src/types/index.ts`:

```typescript
export type IssueCategory =
  | 'billing_plan'
  | 'entitlement'
  | 'auth_token'
  | 'saml_sso'
  | 'api_rate_limit'
  | 'ambiguous';

export type CaseVerdict = 'resolve' | 'clarify' | 'escalate';

export type AgentType =
  | 'BillingPlanAgent'
  | 'EntitlementsAgent'
  | 'AuthTokenAgent'
  | 'ApiRateLimitAgent'
  | 'ResolutionAgent';

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
  toolResults: ToolResult[];
  agentFindings: AgentFinding[];
}

export interface AgentFinding {
  agentName: AgentType;
  summary: string;
  rootCauses: string[];
  recommendedVerdict: CaseVerdict;
  evidence: { docCitations: RagChunk[]; toolResults: ToolResult[] };
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
  customer_response: string; // markdown
  internal_note: string; // markdown
  escalation_id?: string;
}

export type AgentEventType =
  | 'triage'
  | 'routing'
  | 'agent_start'
  | 'agent_done'
  | 'rag_retrieved'
  | 'tool_called'
  | 'verdict'
  | 'complete'
  | 'error';

export interface AgentEvent {
  event: AgentEventType;
  agentName?: AgentType | 'OrchestratorAgent';
  message: string;
  data?: Record<string, unknown>;
  timestamp: string;
}
```

---

## AGENT RESPONSIBILITIES + SCENARIO OWNERSHIP

**OrchestratorAgent** (runs first — not a specialist, not in AgentType):

- MCP: `get_org_context`, `get_case_history`
- RAG: top-5 cosine chunks for `case.description`
- Output: populates `CaseContext.issueCategory` and `CaseContext.routeTo`
- Rule: does NOT resolve — only classifies and routes

**BillingPlanAgent** → Scenarios 2, 8:

- MCP: `check_subscription`, `check_invoice_status`, `get_org_context`
- Logic: `subscription.active_status=false` + `invoice.payment_status='overdue'` → billing-caused access loss

**EntitlementsAgent** → Scenario 1:

- MCP: `check_entitlement`, `check_subscription`
- Logic: `enabled=false` + `source='plan_limit'` → upgrade needed; `source='not_found'` → ESCALATE

**AuthTokenAgent** → Scenarios 3, 5, 6:

- MCP: `get_token_record`, `get_saml_config`, `get_case_history`
- Logic check order: revoked → expired → sso_authorized → permissions → org policy
- SAML: `cert_expiry < now` → ESCALATE

**ApiRateLimitAgent** → Scenario 4:

- MCP: `check_api_usage`
- Direct: `check_service_status`
- Logic: incident first → `throttled_requests > 0` → auth issue (delegate)

**ResolutionAgent** → all scenarios (always runs last):

- Direct: `create_escalation` (if verdict = `'escalate'`)
- Input: full CaseContext with all AgentFindings
- Output: `CaseOutcome`
- Auto-escalation rules (unconditional):
  - `caseHistory.events` with same category, count ≥ 3, none resolved → ESCALATE (Scenario 6)
  - `saml_config.certificate_expiry < now()` → ESCALATE
  - `entitlement.source = 'not_found'` → ESCALATE
  - `issueCategory = 'ambiguous'` + no clarifying info → CLARIFY (Scenario 7)

---

## MCP SERVER — TOOL CONTRACTS

Location: `packages/mcp-server/src/server.ts` | Transport: `StdioServerTransport`

| Tool                   | Input                                                   | Output                                                                                             |
| ---------------------- | ------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| `get_org_context`      | `{ org_id: string }`                                    | `{ org, enterprise?, customer }`                                                                   |
| `check_subscription`   | `{ scope_type: 'org'\|'enterprise', scope_id: string }` | `{ plan_name, billing_cycle, renewal_date, active_status, pending_change? }`                       |
| `check_entitlement`    | `{ scope_type, scope_id, feature_name }`                | `{ enabled, source: 'plan_limit'\|'admin_disabled'\|'provisioned'\|'not_found', entitlement_id? }` |
| `get_token_record`     | `{ token_id: string }`                                  | `{ token_type, owner, org_id, permissions[], sso_authorized, expiration_date, revoked }`           |
| `get_saml_config`      | `{ scope_id, scope_type: 'org'\|'enterprise' }`         | `{ enabled, idp_name, certificate_expiry, last_validated, saml_config_id }`                        |
| `check_api_usage`      | `{ scope_id, time_window: '1h'\|'6h'\|'24h'\|'7d' }`    | `{ api_type, request_count, throttled_requests, time_window }`                                     |
| `get_case_history`     | `{ customer_id, limit?: number }`                       | `{ events: CaseHistoryEvent[], total_count }`                                                      |
| `check_invoice_status` | `{ customer_id: string }`                               | `{ invoice_id, billing_period, amount, currency, payment_status, due_date }`                       |

---

## RAG LAYER

Table: `document_chunks` | Columns: `chunk_id uuid, source_url text, section_heading text, chunk_text text, embedding vector(1536), created_at timestamptz`

**Retrieval — always use this exact SQL, never modify it:**

```sql
SELECT chunk_id, source_url, section_heading, chunk_text,
  1 - (embedding <=> $1::vector) AS score
FROM document_chunks
ORDER BY embedding <=> $1::vector
LIMIT $2;
```

```typescript
// src/rag/retrieve.ts
export async function retrieveChunks(
  query: string,
  limit = 5,
): Promise<RagChunk[]>;
```

---

## DATABASE SCHEMA SUMMARY

All PKs: `uuid` generated via `randomUUID()`. Extension: `CREATE EXTENSION IF NOT EXISTS vector;`

Tables: `customers`, `github_orgs`, `enterprise_accounts`, `subscriptions`, `invoices`, `entitlements`, `token_records`, `saml_configs`, `api_usage`, `support_cases`, `case_history`, `service_status`, `incidents`, `escalations`, `document_chunks`

Key indexes:

- `document_chunks.embedding` → ivfflat (vector_cosine_ops) lists=100
- `support_cases.org_id` → btree
- `token_records.org_id` → btree

---

## EXPRESS API ROUTES

```
POST   /api/cases              → { case_id: string }
GET    /api/cases/:id          → CaseOutcome
POST   /api/cases/:id/run      → starts pipeline, returns SSE stream
GET    /api/cases/:id/stream   → SSE: AgentEvent[]
POST   /api/ingest             → triggers RAG ingestion (admin only)
```

SSE event format:

```
data: {"event":"agent_start","agentName":"BillingPlanAgent","message":"...","timestamp":"..."}
```

---

## REQUIRED SCENARIOS — ACCEPTANCE CRITERIA

| Scenario | Description                    | Primary Agent     | Expected Verdict            |
| -------- | ------------------------------ | ----------------- | --------------------------- |
| S1       | Feature entitlement dispute    | EntitlementsAgent | resolve or escalate         |
| S2       | Paid features locked           | BillingPlanAgent  | resolve                     |
| S3       | PAT failing for org resources  | AuthTokenAgent    | resolve                     |
| S4       | REST API rate limit complaint  | ApiRateLimitAgent | resolve                     |
| S5       | SAML SSO login failure         | AuthTokenAgent    | resolve or escalate         |
| S6       | Repeated unresolved auth issue | AuthTokenAgent    | escalate (auto, ≥3 history) |
| S7       | Ambiguous complaint            | OrchestratorAgent | clarify                     |
| S8       | Billing + technical issue      | BillingPlanAgent  | resolve or escalate         |

Each scenario must produce `CaseOutcome` with:

- `issue_type` correctly identified
- `evidence.doc_citations` non-empty (RAG grounded)
- `evidence.tool_results` showing which MCP tools were called
- `verdict` matching expected above
- `customer_response` in markdown, actionable
- `internal_note` in markdown, cites evidence

---

## CODE GENERATION CHECKLIST

Before generating any code, confirm:

1. State which **phase** the code belongs to
2. State which **agent/tool** owns the logic
3. Read the relevant **skill file** from `.github/skills/`
4. Import from `node:*` for all Node built-ins (backend)
5. Add **Zod validation** on every external input boundary
6. Add **Pino child logger**: `logger.child({ service: '...', agent/tool: '...' })`
7. Wrap DB calls → throw `DatabaseError(msg, cause)`
8. Wrap MCP tool calls → throw `McpToolError(msg, toolName, cause)`
9. Place file in correct **package** per monorepo structure
10. Import types from `packages/backend/src/types/index.ts` — never re-declare
11. Angular: `OnPush` + `standalone` + `inject()` + `signal()` on every component
12. New MCP tool: description starts with data source, lists return shape, lists triggers
13. SQL: parameterized only, never template literals
14. IDs: `randomUUID()` from `node:crypto`
