# CODEFLOW — GitHub Support Resolution System

> **Purpose of this document:** A complete, top-to-bottom walkthrough of every moving part in this codebase. You should be able to read this once and understand exactly what runs, in what order, why, and how each technology choice serves the requirement.

---

## Table of Contents

1. [What this system does (in plain English)](#1-what-this-system-does-in-plain-english)
2. [High-level architecture diagram](#2-high-level-architecture-diagram)
3. [Infrastructure layer — Docker, Postgres, Redis](#3-infrastructure-layer)
4. [Backend bootstrap — how the server starts](#4-backend-bootstrap)
5. [The database schema — every table explained](#5-the-database-schema)
6. [The RAG layer — ingesting and retrieving docs](#6-the-rag-layer)
7. [The MCP server — the tool bus](#7-the-mcp-server)
8. [The agent pipeline — the brain of the system](#8-the-agent-pipeline)
9. [The Express API — HTTP routes and SSE streaming](#9-the-express-api)
10. [The Angular frontend](#10-the-angular-frontend)
11. [Data flow for a single support case (end-to-end trace)](#11-end-to-end-trace)
12. [The 8 test scenarios — what they prove](#12-the-8-test-scenarios)
13. [Error handling strategy](#13-error-handling-strategy)
14. [Key technology decisions and why](#14-key-technology-decisions)
15. [Environment variables reference](#15-environment-variables-reference)
16. [File-by-file reference map](#16-file-by-file-reference-map)

---

## 1. What this system does (in plain English)

This is an **AI-powered GitHub Enterprise support ticket resolution system**.

When a GitHub Enterprise customer files a support case (e.g., "my Actions minutes are not working" or "my PAT is returning 403"), the system:

1. **Classifies** the ticket into one of five categories: billing, entitlements, auth/token, SAML/SSO, or API rate limits.
2. **Gathers evidence** by querying a live PostgreSQL database (simulating GitHub's internal systems) through a **Model Context Protocol (MCP)** tool server.
3. **Retrieves relevant GitHub documentation** from a vector database using semantic search (RAG — Retrieval-Augmented Generation).
4. **Runs specialist AI agents** (powered by Claude claude-sonnet-4-20250514) that reason over the evidence.
5. **Synthesizes a verdict**: `resolve` (give the customer steps to fix it), `clarify` (ask for more info), or `escalate` (hand off to a human engineer).
6. **Writes two responses**: a customer-facing markdown reply and an internal engineering note.
7. **Streams all of this live** to the UI via Server-Sent Events (SSE) so you can watch agents work in real time.

---

## 2. High-level architecture diagram

```
┌──────────────────────────────────────────────────────────────────┐
│                      ANGULAR FRONTEND (:4200)                    │
│   Case Submit Form → Case Detail (live SSE stream) → Outcome     │
│   Scenario Runner (pre-seeded test cases)                        │
└────────────────────────────┬─────────────────────────────────────┘
                             │ HTTP / SSE (proxied)
                             ▼
┌──────────────────────────────────────────────────────────────────┐
│                 EXPRESS API SERVER (:3000)                        │
│   POST /api/cases          → creates case in Postgres            │
│   POST /api/cases/:id/run  → starts pipeline, streams SSE        │
│   GET  /api/cases/:id      → returns CaseOutcome from Redis      │
│   GET  /api/cases          → lists all cases                     │
│   POST /api/ingest         → triggers RAG doc ingestion          │
└────────┬──────────────────────────────────┬──────────────────────┘
         │ spawns child process             │ queries
         ▼                                  ▼
┌─────────────────────┐         ┌─────────────────────────────────┐
│   MCP SERVER        │         │  PostgreSQL + pgvector (:5434)  │
│   (stdio transport) │         │  Redis (:6380)                  │
│   8 tools           │         └─────────────────────────────────┘
│   Zod-validated     │
│   Postgres queries  │
└─────────────────────┘

Inside the Express process (agent pipeline):

  OrchestratorAgent
      │ calls MCP: get_org_context, get_case_history
      │ calls OpenAI: embed(description) → vector search → RAG chunks
      │ calls Claude: classify + route
      ▼
  Specialist Agents (run in sequence per routing decision)
  ┌──────────────────┬──────────────────┬──────────────────┬────────────────────┐
  │ BillingPlanAgent │EntitlementsAgent │ AuthTokenAgent   │ApiRateLimitAgent   │
  │ MCP: subscription│ MCP: entitlement │ MCP: token_record│ MCP: api_usage     │
  │      invoice     │      subscription│      saml_config │ Direct: svc_status │
  │ Claude: analyze  │ Claude: analyze  │ Claude: analyze  │ Claude: analyze    │
  └──────────────────┴──────────────────┴──────────────────┴────────────────────┘
      ▼
  ResolutionAgent
      │ checks auto-escalation rules (no Claude needed for those)
      │ calls Claude: synthesize all findings → verdict + response text
      │ if escalate: calls createEscalation() → Postgres INSERT
      │ persists CaseOutcome to Redis (24h TTL)
      │ updates support_cases.status in Postgres
      ▼
  CaseOutcome → emitted as SSE 'complete' event → Angular updates UI
```

---

## 3. Infrastructure layer

### Files: `docker-compose.yml`

**Two Docker containers spin up before anything else:**

#### PostgreSQL (pgvector/pgvector:pg17)

- Port mapping: `5434` on host → `5432` in container
- Image is `pgvector/pgvector:pg17` — this is NOT standard Postgres. It is Postgres with the `pgvector` extension pre-installed. The extension adds a new column type `vector(1536)` and the `<=>` cosine distance operator needed for semantic search.
- The schema SQL file is mounted as an init script, so the schema is created automatically on first start: `./packages/backend/src/db/schema.sql:/docker-entrypoint-initdb.d/01-schema.sql`
- Data is persisted in a named Docker volume `postgres_data`.

#### Redis (redis:7-alpine)

- Port mapping: `6380` on host → `6379` in container
- Append-only persistence mode (`--appendonly yes`) so data survives container restarts.
- Used for two things:
  1. **Caching `CaseOutcome` JSON** with a 24-hour TTL (key pattern: `outcome:<case_id>`)
  2. **Storing SSE event lists** for replay (key pattern: `events:<case_id>`)

**Why Redis for these?** The pipeline result is generated once and expensive (multiple LLM calls). Storing it in Redis means the `GET /api/cases/:id` route returns instantly without re-running the pipeline. The event list allows replaying the live stream after the fact via `GET /api/cases/:id/stream`.

---

## 4. Backend bootstrap

### File: `packages/backend/src/index.ts`

This is the entry point. When you run `npm run dev -w packages/backend`, `tsx` executes this file.

**Step-by-step startup sequence:**

```
1. process.env is available (Node)
2. config/env.ts is imported → Zod validates ALL required env vars immediately
   If ANY var is missing/wrong, the process crashes with a clear error. Never silently.
3. createApp() is called → builds the Express app with all middleware + routes
4. app.listen(PORT) starts the HTTP server
5. SIGTERM / SIGINT handlers are registered for graceful shutdown
   On shutdown: MCP client closes, Postgres pool drains, Redis disconnects
```

**Why fail-fast on env vars?** The entire pipeline depends on `DATABASE_URL`, `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, etc. If any are missing, agents will fail mid-request in confusing ways. Crashing at startup forces the operator to fix config before the server accepts any traffic.

### File: `packages/backend/src/config/env.ts`

```typescript
// Zod schema — every env var is declared here with its type, default, and constraint
const envSchema = z.object({
  DATABASE_URL: z.string().url(),          // must be a valid URL
  ANTHROPIC_API_KEY: z.string().min(1),    // must be non-empty
  OPENAI_API_KEY: z.string().min(1),
  MCP_SERVER_PATH: z.string().min(1),      // path to compiled MCP server binary
  PORT: z.coerce.number().default(3000),   // coerce string → number, default 3000
  ...
});

export const env = envSchema.parse(process.env); // throws if invalid
```

`env` is a module-level constant. Every file that needs an env var imports `env` from here — never reads `process.env` directly. This ensures all vars are validated and typed.

---

## 5. The database schema

### File: `packages/backend/src/db/schema.sql`

The schema creates **16 tables** organized in layers:

#### Customer & Org hierarchy

```
customers                          — top-level billing entity
  └── enterprise_accounts          — enterprise umbrella (optional)
        └── github_orgs            — GitHub organization (the actual product unit)
```

- `customers`: who pays. Has `support_tier` (basic/premium/enterprise) that determines what kind of help they get.
- `enterprise_accounts`: GitHub Enterprise contracts — enables SAML, enterprise policies.
- `github_orgs`: the actual org on GitHub. Has `current_plan` (Free/Team/Enterprise), `billing_status` (active/past_due/suspended), `sso_enabled`.

**Why this hierarchy?** A single company (customer) can have one enterprise account covering multiple orgs, or individual orgs without enterprise. Billing happens at the customer level, but features and entitlements may be scoped to either the org or the enterprise. The agents need to check both levels.

#### Billing tables

- `subscriptions`: links a plan to either an org or enterprise (`scope_type + scope_id`). Has `active_status` (can go false when payment lapses) and `pending_change` (e.g., "downgrading to Team on 2026-05-01").
- `invoices`: per-customer invoice records with `payment_status` (paid/pending/overdue/failed).

**Why separate subscriptions from invoices?** A subscription is the recurring contract; an invoice is a specific payment event. A subscription can be active even with an outstanding invoice (grace period). The BillingPlanAgent checks both and uses their combination to determine root cause.

#### Auth tables

- `token_records`: PAT (Personal Access Token), OAuth, and App tokens. The key diagnostic fields are `revoked`, `expiration_date`, `sso_authorized`, and `permissions` (JSONB array).
- `saml_configs`: SAML/SSO configuration per org or enterprise. The critical field is `certificate_expiry` — an expired IdP certificate breaks SSO for everyone in the org.

#### Entitlements

- `entitlements`: a feature → org/enterprise mapping. The `source` field explains _why_ a feature is disabled: `plan_limit` (upgrade needed), `admin_disabled` (org admin turned it off), `provisioned` (it should work), `not_found` (no record exists — unusual, requires investigation).

#### API usage

- `api_usage`: pre-aggregated request counts per org per time window (1h/6h/24h/7d). `throttled_requests > 0` means the org is actually hitting rate limits.

#### Support workflow tables

- `support_cases`: the ticket. Gets an `issue_category` assigned by the OrchestratorAgent after triage, and `status` updated by the ResolutionAgent after verdict.
- `case_history`: audit log of events on a case (opened, escalated, etc.). Used by the AuthTokenAgent to detect repeat failures.
- `escalations`: created when verdict is `escalate`. Records the reason and evidence summary for the human engineer.
- `service_status` + `incidents`: GitHub service health data. Checked by the ApiRateLimitAgent to rule out platform-level incidents before blaming the customer.

#### RAG table

- `document_chunks`: stores pre-chunked GitHub documentation as text + 1536-dimensional embedding vectors. The `embedding vector(1536)` column type is provided by the pgvector extension. The `IVFFlat` index enables sub-linear approximate nearest-neighbor search — without it, every similarity query would be a full table scan.

---

## 6. The RAG layer

RAG = Retrieval-Augmented Generation. The idea: before asking Claude to reason about a support case, we first retrieve the most relevant pieces of documentation and inject them as context. This prevents hallucination and grounds responses in real GitHub documentation.

### 6a. Ingestion — `packages/backend/src/rag/ingest.ts`

**When does this run?** Manually via `npm run ingest -w packages/backend` OR via `POST /api/ingest` (admin-only).

**What it does, step by step:**

```
SOURCE_URLS (22 GitHub documentation pages)
    │
    ▼ fetchWithRetry()
    HTML page content
    │
    ▼ extractArticleHtml()
    Extracts <article> or <main> or <body> tag — skips nav/header/footer
    │
    ▼ htmlToMarkdown() [using turndown library]
    Converts HTML to clean Markdown — headings become #, code blocks become fenced
    │
    ▼ splitIntoChunks()
    Splits Markdown into sections by heading (##, ###, etc.)
    Each section ≤ 2000 chars is one chunk
    Sections > 2000 chars are sub-chunked with 200-char overlap
    Each chunk gets a deterministic SHA-256 UUID (so re-runs don't create duplicates)
    │
    ▼ embedBatch() [OpenAI text-embedding-3-small, batches of 100]
    Each chunk text → 1536-float vector
    │
    ▼ INSERT INTO document_chunks ... ON CONFLICT (chunk_id) DO UPDATE
    Upsert — safe to re-run, updates embedding if text changed
```

**Why deterministic chunk IDs?** Normally all IDs in this system use `randomUUID()`. Chunks are the exception because the ingest script runs multiple times (on redeploy, after adding new URLs). Random IDs would create duplicate rows. SHA-256 of `(url + heading + index)` produces the same ID for the same content every time, allowing safe upserts.

**Why `text-embedding-3-small`?** It produces 1536-dimensional vectors — a good balance of quality and cost. The same model must be used at ingest time AND query time, otherwise the vector spaces don't match and similarity search is meaningless.

### 6b. Retrieval — `packages/backend/src/rag/retrieve.ts`

Called by OrchestratorAgent for every support case.

```typescript
export async function retrieveChunks(
  query: string,
  limit = 5,
): Promise<RagChunk[]>;
```

**What it does:**

```
query string (support case description)
    │
    ▼ openai.embeddings.create({ model: 'text-embedding-3-small', input: query })
    1536-float vector representing the meaning of the query
    │
    ▼ BEGIN; SET LOCAL ivfflat.probes = 20;
    SQL: SELECT ... 1 - (embedding <=> $1::vector) AS score
         FROM document_chunks ORDER BY embedding <=> $1::vector LIMIT $2
    COMMIT;
    │
    ▼ Returns top-5 RagChunk[] with cosine similarity scores (0–1, higher = more relevant)
```

**The `<=>` operator:** This is the pgvector cosine distance operator. `1 - (embedding <=> query_vector)` gives cosine _similarity_ (0 = unrelated, 1 = identical meaning). The IVFFlat index makes this fast at scale.

**Why `SET LOCAL ivfflat.probes = 20`?** IVFFlat divides vectors into "lists" (clusters). By default it only scans 1 list per query. With only ~262 rows (our seed data), this means it might miss the best matches. Setting probes=20 scans 20 lists, giving full recall on small datasets. This is wrapped in a transaction because `SET LOCAL` only applies within a transaction.

---

## 7. The MCP server

### What is MCP?

Model Context Protocol (MCP) is an open standard for connecting AI systems to external data sources and tools. Think of it as a standardized RPC protocol designed specifically for LLM tool-use.

### Why use MCP here instead of direct DB calls in agents?

The MCP server is a **separate process** that owns all database read access. The agents don't query the database directly — they call MCP tools. This achieves:

1. **Separation of concerns**: agents contain only reasoning logic; the MCP server contains all data access logic.
2. **Standardized interface**: each tool has a Zod-validated input schema and a defined return shape. If an agent passes a wrong type, it fails at the Zod boundary, not deep inside SQL.
3. **Reusability**: the same MCP server could be connected to different agents or even a Claude Desktop client for manual debugging.
4. **Process isolation**: database credentials only need to be in the MCP server process environment, not in the main application process.

### File: `packages/mcp-server/src/server.ts`

**Transport: StdioServerTransport**

The MCP server communicates over standard input/output (stdin/stdout) — it's launched as a child process by the backend and talks over pipes. This is the simplest possible IPC mechanism and requires no network port.

**How the backend connects:**

```typescript
// packages/backend/src/lib/mcp-client.ts

const transport = new StdioClientTransport({
  command: 'node',
  args: [resolvedMcpPath],         // path to compiled mcp-server/dist/server.js
  env: { DATABASE_URL, ... },      // pass only what MCP server needs
});

const client = new Client(...);
await client.connect(transport);   // spawns child process + handshake
```

The `McpClient` class is a singleton with lazy initialization — it connects on first tool call, not at startup. Subsequent calls reuse the same connection.

**The 8 MCP tools:**

| Tool                   | Input                                | What the SQL does                                                      | Why it exists                                 |
| ---------------------- | ------------------------------------ | ---------------------------------------------------------------------- | --------------------------------------------- |
| `get_org_context`      | `org_id`                             | Joins `github_orgs` + `customers` + optional `enterprise_accounts`     | Gives agents full account context in one call |
| `check_subscription`   | `scope_type, scope_id`               | Queries `subscriptions` for the most recent active entry               | Determines if subscription is active/lapsed   |
| `check_entitlement`    | `scope_type, scope_id, feature_name` | Queries `entitlements` by feature; returns `not_found` shape if no row | Tells agents why a feature is inaccessible    |
| `get_token_record`     | `token_id`                           | Queries `token_records` by UUID                                        | Inspects PAT/OAuth token state                |
| `get_saml_config`      | `scope_id, scope_type`               | Queries `saml_configs`                                                 | Finds SAML cert expiry, IdP config            |
| `check_api_usage`      | `scope_id, time_window`              | Queries `api_usage` for the given window                               | Shows throttled request counts                |
| `get_case_history`     | `customer_id, limit`                 | CTE: last N cases + LEFT JOIN case_history events + total_count        | Detects repeat failures for auto-escalation   |
| `check_invoice_status` | `customer_id`                        | Queries `invoices` by customer, newest first                           | Checks if payment is overdue                  |

**Every tool follows this exact pattern:**

```typescript
server.tool(
  'tool_name',
  'Description: data source, return shape, when to use (for Claude tool selection)',
  { input: z.string().uuid() }, // Zod schema — invalid input throws before any DB work
  async ({ input }) => {
    try {
      const result = await pool.query<RowType>('SELECT ... WHERE col = $1', [
        input,
      ]);
      return {
        content: [
          { type: 'text', text: JSON.stringify(result.rows[0] ?? null) },
        ],
      };
    } catch (err) {
      throw new McpToolError('Failed', 'tool_name', err);
    }
  },
);
```

The return format `{ content: [{ type: 'text', text: JSON.stringify(...) }] }` is the MCP protocol's standard. The backend's `McpClient.callTool()` unwraps this, parses the JSON, and returns the plain object.

---

## 8. The agent pipeline

### Overview

The pipeline runs inside the Express process (not in the MCP server). It is orchestrated by the `runPipeline()` function in `cases.router.ts`.

### The shared `CaseContext` object

Every agent reads from and writes to a single `CaseContext` object that accumulates evidence as the pipeline runs:

```typescript
interface CaseContext {
  caseInput: SupportCase; // the original ticket
  orgContext: OrgContext; // from get_org_context MCP tool
  caseHistory: CaseHistoryEvent[]; // from get_case_history MCP tool
  ragChunks: RagChunk[]; // top-5 similar doc chunks
  issueCategory: IssueCategory; // set by OrchestratorAgent
  routeTo: AgentType[]; // set by OrchestratorAgent
  toolResults: ToolResult[]; // grows as each agent adds its tool calls
  agentFindings: AgentFinding[]; // grows as each specialist agent completes
}
```

This design means each agent can see everything the previous agents found. The ResolutionAgent, which runs last, has the complete picture.

---

### Agent 1: OrchestratorAgent

**File:** `packages/backend/src/agents/orchestrator.agent.ts`

**Purpose:** Classification and routing. It does NOT attempt to resolve anything.

**Step by step:**

```
1. callMCP('get_org_context', { org_id })
   → gets org plan, billing status, enterprise membership, customer support tier
   → stored in context.orgContext

2. callMCP('get_case_history', { customer_id, limit: 20 })
   → gets the 20 most recent support cases and their events
   → stored in context.caseHistory
   → will be used by AuthTokenAgent AND ResolutionAgent for repeat-failure detection

3. retrieveChunks(caseInput.description, 5)
   → embeds the description with OpenAI
   → runs pgvector cosine search
   → returns top-5 relevant documentation chunks
   → stored in context.ragChunks (shared with all downstream agents)

4. Call Claude claude-sonnet-4-20250514 with:
   System: "classify into one category, return JSON {issueCategory, routeTo}"
   User: the case JSON + org context + RAG doc excerpts

   Claude returns JSON like:
   { "issueCategory": "auth_token", "routeTo": ["AuthTokenAgent"] }

5. Returns the fully populated CaseContext
```

**Why use Claude for classification, not a simple keyword match?** Support tickets are written in natural language and are often ambiguous. "Our pipeline is broken" could be billing, entitlements, auth, or a GitHub service incident. Claude can reason about the full context (org plan, SSO status, case history) to pick the right category. A keyword matcher would misclassify frequently.

**Why RAG at this stage (before classification)?** The doc chunks provide Claude with signal about what categories exist and how to distinguish them. For example, a chunk about "SAML certificate expiry" helps Claude recognize that an auth failure might be SSO-related.

---

### Agent 2: BillingPlanAgent

**File:** `packages/backend/src/agents/billing-plan.agent.ts`

**Runs when:** `routeTo` includes `"BillingPlanAgent"` (Scenarios 2 and 8)

**Step by step:**

```
1. callMCP('check_subscription', { scope_type: 'org', scope_id: org_id })
   → is the subscription active? what plan?

2. If org has an enterprise_id:
   callMCP('check_subscription', { scope_type: 'enterprise', scope_id: enterprise_id })
   → enterprise subscription may override org-level plan

3. callMCP('check_invoice_status', { customer_id })
   → is the latest invoice overdue? failed?

4. Call Claude with all three data objects + RAG chunks
   System prompt includes the logic rules:
     active_status=false AND payment_status='overdue' → billing-caused access loss → resolve
     active_status=false AND invoice paid → provisioning issue → escalate
     active AND features missing → plan limit → resolve with upgrade guidance

5. Returns AgentFinding { summary, rootCauses, recommendedVerdict }
```

**Why both org AND enterprise subscription?** An org that belongs to an enterprise may get features from the enterprise plan. If the enterprise subscription lapses, all member orgs lose those features. Checking only the org subscription would miss this.

---

### Agent 3: EntitlementsAgent

**File:** `packages/backend/src/agents/entitlements.agent.ts`

**Runs when:** `routeTo` includes `"EntitlementsAgent"` (Scenario 1)

**Step by step:**

```
1. Claude LLM call #1 — feature name extraction:
   System: "extract feature name from this support case description, return { featureName: string }"
   User: the case description
   → extracts e.g. "github_actions_minutes" from "Actions minutes not working"

   Why LLM for this? Feature names in support tickets are written in human language
   ("Actions minutes", "code scanning", "Dependabot"). The DB stores them in snake_case.
   Claude bridges that gap without hardcoded regex mappings.

2. Determine scope: if enterprise_id exists → scope_type='enterprise', else 'org'
   Why check enterprise first? Enterprise entitlements override org-level ones.

3. callMCP('check_entitlement', { scope_type, scope_id, feature_name })
   → returns { enabled: bool, source: 'plan_limit'|'admin_disabled'|'provisioned'|'not_found' }

4. callMCP('check_subscription', { scope_type, scope_id })
   → context for the analysis: what plan is this org on?

5. Claude LLM call #2 — analysis:
   System: "apply logic: plan_limit → resolve+upgrade, admin_disabled → resolve+enable, not_found → escalate"
   User: entitlement data + subscription data + RAG docs
   → returns { summary, rootCauses, recommendedVerdict }
```

---

### Agent 4: AuthTokenAgent

**File:** `packages/backend/src/agents/auth-token.agent.ts`

**Runs when:** `routeTo` includes `"AuthTokenAgent"` (Scenarios 3, 5, 6)

This agent handles both PAT failures AND SAML SSO failures — both are authentication issues.

**Step by step:**

```
1. Claude LLM call #1 — token ID extraction:
   System: "if a UUID is in the description, return { tokenId: '<uuid>' }, else { tokenId: null }"
   User: the case description
   → customer may paste their token ID or may not

2. If tokenId was found:
   callMCP('get_token_record', { token_id })
   → revoked? expired? sso_authorized? permissions?

3. callMCP('get_saml_config', { scope_id: org_id, scope_type: 'org' })
   → certificate_expiry? is SSO enabled?

4. Check repeat history:
   Count events in context.caseHistory where event_type is 'case_opened' or 'escalated'
   (This is a proxy for same-category repeat failures)

5. Claude LLM call #2 — analysis with ordered checks:
   Check in order: revoked → expired → sso_authorized=false → missing permissions → cert expired → repeat history
   Each condition maps to a different recommended action

6. Returns AgentFinding
```

**Why ordered checks?** A token could be both expired AND not SSO-authorized. The correct advice differs: "renew the token" vs "re-authorize via SSO". The order prioritizes the most actionable root cause.

---

### Agent 5: ApiRateLimitAgent

**File:** `packages/backend/src/agents/api-rate-limit.agent.ts`

**Runs when:** `routeTo` includes `"ApiRateLimitAgent"` (Scenario 4)

```
1. callMCP('check_api_usage', { scope_id: org_id, time_window: '1h' })
   → throttled_requests in the last hour?

2. callMCP('check_api_usage', { scope_id: org_id, time_window: '24h' })
   → throttled_requests over the last day? (catches intermittent issues)

3. checkServiceStatus() — DIRECT DB call, not MCP
   → queries service_status and incidents tables
   Why direct? Service status data is platform-level, not customer-specific.
   It doesn't need the MCP tool boundary. It's a simpler, less sensitive read.

   Priority: if there's an active incident affecting the API component,
   that is almost certainly the root cause. No point looking at rate limit counters.

4. Claude LLM call — analysis:
   active incidents → service issue, resolve with status page link
   throttled in 1h → hitting rate limits now, resolve with backoff guidance
   throttled in 24h but not 1h → intermittent, resolve with monitoring guidance
   no throttling → possibly auth issue, clarify
```

---

### Agent 6: ResolutionAgent

**File:** `packages/backend/src/agents/resolution.agent.ts`

**Always runs last.** Receives the full `CaseContext` with all tool results and agent findings.

**Step by step:**

```
1. checkAutoEscalation(context) — deterministic rules, no LLM:

   Rule 1: issueCategory === 'ambiguous' → force verdict = 'clarify'
           (Scenario 7: "GitHub is not working" → we can't help without more info)

   Rule 2: openEvents.length >= 3 → force verdict = 'escalate'
           (Scenario 6: 3+ prior case_opened/escalated events → chronic issue, needs human)

   Rule 3: any get_saml_config tool result where certificate_expiry < now() → force 'escalate'
           (SAML cert renewal requires IdP admin access — support engineers can't do this)

   Rule 4: any check_entitlement result where source === 'not_found' → force 'escalate'
           (Missing entitlement record is a data anomaly — needs investigation)

2. Aggregate all evidence:
   - Deduplicate RAG citations by chunk_id (OrchestratorAgent and specialist agents both contribute)
   - Combine all toolResults from all agents
   - Collect all agent finding summaries as key_findings strings

3. Claude LLM call — synthesis:
   If forcedVerdict exists, the system prompt says "verdict MUST be '<forced>'"
   User prompt: case + issueCategory + all agent findings + tool results + RAG chunks

   Claude produces:
   {
     "verdict": "resolve" | "clarify" | "escalate",
     "key_findings": ["finding1", "finding2"],
     "customer_response": "## markdown reply to customer",
     "internal_note": "## markdown note for engineers"
   }

4. If verdict === 'escalate':
   createEscalation(case_id, reason, severity, evidenceSummary)
   → INSERT INTO escalations → returns escalation_id
   This creates a work item for the support engineering team.

5. Build CaseOutcome and persist to Redis:
   redis.set(`outcome:${case_id}`, JSON.stringify(outcome), 'EX', 86400)

6. Update support_cases table:
   status = 'resolved' | 'escalated' | 'pending_clarification'
   issue_category = <classified category>
```

**Why auto-escalation rules run before Claude?** Some verdicts must never be overridden by LLM reasoning. An expired SAML certificate MUST be escalated — the customer cannot fix it themselves, and Claude could theoretically be convinced otherwise if the context looked ambiguous. Hard-coded rules guarantee these cases.

---

## 9. The Express API

### File: `packages/backend/src/api/app.ts`

Sets up the Express app with:

- `express.json()` body parser
- Manual CORS middleware (allows only `ALLOWED_ORIGIN`, default `http://localhost:4200`)
- Request logging middleware (Pino)
- Routes under `/api`
- Error handler middleware (last in chain)

### File: `packages/backend/src/api/cases.router.ts`

#### `POST /api/cases` — Create a support case

```
Request body (Zod-validated):
  { customer_id, org_id, title, description, severity }

1. Generate randomUUID() for case_id
2. INSERT INTO support_cases (status='open', no issue_category yet)
3. Return { case_id }
```

The case is created empty — classification and resolution happen when `/run` is called. This separation lets the UI show the case immediately and start the pipeline in a separate step.

#### `POST /api/cases/:id/run` — Run the pipeline (SSE)

This is the core route. It starts the multi-agent pipeline and streams results live.

```
1. Query support_cases WHERE case_id = $1
   Return 404 if not found

2. Set SSE headers:
   Content-Type: text/event-stream
   Cache-Control: no-cache
   Connection: keep-alive
   X-Accel-Buffering: no   (prevents nginx from buffering the stream)

   res.flushHeaders()   → sends headers immediately, opening the SSE stream

3. Define emit(event: AgentEvent) function:
   - Writes  "data: <json>\n\n"  to the response stream
   - Also  redis.rpush(`events:${id}`, JSON.stringify(event))  for replay

4. runPipeline(supportCase, emit):
   - emit('triage') → OrchestratorAgent.run()
   - emit('routing') → show what agents were selected
   - emit('rag_retrieved') → show doc count
   - For each agent in routeTo:
       emit('agent_start')
       finding = agent.run(context)
       context.agentFindings.push(finding)
       emit('agent_done', { verdict, rootCauses })
   - emit('verdict') → ResolutionAgent.run()
   - emit('complete', { verdict, issue_type, escalation_id })

5. res.end() — closes SSE stream
```

**Why SSE instead of WebSockets?** The pipeline only flows one direction: server → client. SSE is unidirectional HTTP — simpler than WebSockets, works through most proxies, and natively reconnects. WebSockets would add unnecessary complexity for a one-way stream.

**Why use `fetch` + `ReadableStream` on the frontend instead of the `EventSource` API?** The standard `EventSource` API only supports `GET` requests. We need to `POST` to `/run` to trigger the pipeline. The `EventSourceService` uses `fetch()` with streaming and manually parses the `data: <json>\n\n` SSE format.

#### `GET /api/cases/:id` — Return the outcome

```
1. redis.get(`outcome:${id}`)
2. If null → 404
3. Parse JSON and return CaseOutcome
```

Fast path: no DB query. The outcome was stored by ResolutionAgent when the pipeline completed.

#### `GET /api/cases/:id/stream` — Replay events as SSE

```
1. redis.lrange(`events:${id}`, 0, -1)   → all stored SSE events
2. If empty → 404
3. Write each as "data: <json>\n\n" and close
```

Useful for viewing a completed pipeline's events from the start (e.g., after page refresh).

#### `GET /api/cases` — List all cases

Returns the 50 most recent support cases from Postgres. Used by the Scenario Runner page.

#### `POST /api/ingest` — Trigger RAG ingestion (admin)

```
1. Check x-admin-key header matches ADMIN_API_KEY env var
2. Return 202 immediately (non-blocking)
3. Run ingestAll() in background — fetches 22 GitHub doc pages, chunks, embeds, upserts
```

Protected because ingestion makes ~22 HTTP requests + hundreds of OpenAI embedding API calls — expensive and should not be triggered by anyone.

### Middleware

**`packages/backend/src/api/middleware/request-logger.ts`**  
Pino child logger that logs every request and response with method, URL, status code, and duration.

**`packages/backend/src/api/middleware/error-handler.ts`**  
Catches any thrown error. If it's an `AppError` subclass, uses its `statusCode` and `code`. Otherwise returns 500. Logs every error with the full cause chain.

---

## 10. The Angular frontend

### Technology choices

- **Angular 21** with **standalone components** — no NgModules anywhere. Every component is self-contained and declares its own imports.
- **Zoneless change detection** (`provideZonelessChangeDetection()`) — Angular's experimental mode where Zone.js is not used. Components only re-render when a signal changes. This is faster and easier to reason about.
- **Signals** (`signal()`, `computed()`) — reactive state primitives. No `BehaviorSubject`, no `@Input` with `ngOnChanges`, no manual subscriptions for component state.
- **`ChangeDetectionStrategy.OnPush`** — every component. Combined with signals, Angular only checks a component when its input signals change.
- **Angular Material 21** — the UI component library for cards, forms, spinners, chips, icons.

### File: `packages/frontend/src/app/app.config.ts`

Provides the application-wide Angular configuration:

```typescript
providers: [
  provideZonelessChangeDetection(), // no Zone.js
  provideAnimationsAsync(), // lazy-load animation module
  provideHttpClient(), // Angular's HttpClient (used by CaseService)
  provideRouter(routes), // SPA router
];
```

### File: `packages/frontend/src/app/app.routes.ts`

Three routes, all lazy-loaded (Angular splits them into separate bundles):

| Path         | Component                 | Purpose                                  |
| ------------ | ------------------------- | ---------------------------------------- |
| `/`          | `CaseSubmitComponent`     | Create a new support case                |
| `/cases/:id` | `CaseDetailComponent`     | Watch the pipeline run live, see outcome |
| `/scenarios` | `ScenarioRunnerComponent` | Browse and run pre-seeded test scenarios |

### Feature: CaseSubmitComponent

**File:** `packages/frontend/src/app/features/case-submit/case-submit.component.ts`

```
Reactive form (FormBuilder.nonNullable.group):
  title        — required, 5–500 chars
  description  — required, min 10 chars
  severity     — required, enum: low/medium/high/critical
  customer_id  — required, UUID pattern validation
  org_id       — required, UUID pattern validation

onSubmit():
  1. Validate form (mark all touched to show errors if invalid)
  2. loading.set(true)
  3. caseService.createCase(formValue)  → POST /api/cases
  4. On success: navigate to /cases/:id  (triggers pipeline)
  5. On error: error.set(message), loading.set(false)
```

`loading` and `error` are `signal()`s. The template uses `@if (loading())` to show/hide the spinner. Because Angular is zoneless, only this component's signals trigger re-renders — not global Zone ticks.

### Feature: CaseDetailComponent

**File:** `packages/frontend/src/app/features/case-detail/case-detail.component.ts`

This is the most complex component. It orchestrates the live pipeline view.

```
ngOnInit():
  1. Read case_id from route params
  2. Call startPipeline(id)

startPipeline(id):
  1. eventSourceService.runCase(id).subscribe(...)
     → EventSourceService POSTs to /api/cases/:id/run
     → Returns Observable<AgentEvent> that emits one event per SSE message

  2. On each AgentEvent:
     agentEvents.update(prev => [...prev, event])  → adds to the list signal
     Template re-renders the event list automatically

     If event.event === 'complete':
       fetchOutcome(id)  → GET /api/cases/:id from Redis

     If event.event === 'error':
       loading.set(false), error.set(message)

  3. fetchOutcome(id):
     caseService.getOutcome(id).subscribe(...)
     outcome.set(result)   → triggers OutcomeCardComponent to render
     loading.set(false)

Computed signals:
  isRunning = computed(() => loading() && outcome() === null)
  isComplete = computed(() => outcome() !== null)
```

### Feature: ScenarioRunnerComponent

**File:** `packages/frontend/src/app/features/scenario-runner/scenario-runner.component.ts`

Shows cards for all 8 test scenarios. On `ngOnInit`, fetches the list of existing cases from the DB. Each scenario card shows:

- The scenario title and description
- The expected verdict
- The primary agent

When "Run" is clicked:

- If a matching seeded case exists (matched by title prefix), navigate directly to it
- Otherwise create a new case with the scenario's description and navigate to it

### Services

**`CaseService`** — thin HTTP wrapper:

- `createCase(payload)` → `POST /api/cases`
- `getOutcome(caseId)` → `GET /api/cases/:id`
- `listCases()` → `GET /api/cases`

**`EventSourceService`** — SSE streaming:

- `runCase(caseId)` → wraps `fetch()` + `ReadableStream` in an `Observable<AgentEvent>`. Manually parses the `data: <json>\n\n` SSE wire format. Emits each parsed `AgentEvent`. Completes on `complete` or `error` event.
- `replayCase(caseId)` → uses the native `EventSource` API on `GET /api/cases/:id/stream`. Simpler because GET is supported by `EventSource`.

### Shared Components

- **`AgentEventCardComponent`** — renders a single SSE event as a card with icon, timestamp, event type chip, and collapsible data JSON.
- **`OutcomeCardComponent`** — renders the final `CaseOutcome`: verdict badge, customer response (markdown), internal note, citations list, tool results.

### Proxy config: `packages/frontend/proxy.conf.json`

Angular's dev server proxies `/api` requests to `http://localhost:3000`, so the frontend can call `/api/cases` without CORS issues during development.

---

## 11. End-to-end trace

Let's trace **Scenario 2 (Paid Features Locked)** through the entire system:

```
SEED DATA (in Postgres from seed.ts):
  customer: Acme Corp (customer_id=X)
  org: acme-data (billing_status='past_due', sso_enabled=false)
  subscription: Enterprise plan, active_status=FALSE
  invoice: payment_status='overdue', due_date='2026-04-01'
  support_case: "All premium features suddenly locked" (status='open')

─────────────────────────────────────────────────────────────
STEP 1: User opens /scenarios in Angular
  CaseService.listCases() → GET /api/cases → SELECT FROM support_cases
  ScenarioRunnerComponent shows 8 scenario cards
  Scenario 2 card: "Paid Features Locked" — BillingPlanAgent — resolve

STEP 2: User clicks "Run" on Scenario 2
  getCaseForScenario('Paid Features Locked') finds the seeded case
  Router.navigate(['/cases', case_id])

STEP 3: CaseDetailComponent.ngOnInit()
  eventSourceService.runCase(case_id)
  → fetch POST /api/cases/:id/run

STEP 4: Backend receives POST /api/cases/:id/run
  setSseHeaders(res); res.flushHeaders()   → stream opens

STEP 5: runPipeline() begins

  emit('triage', 'Starting case analysis...')
  ─── Angular receives this, shows "triage" event card ───

  OrchestratorAgent.run():
    MCP → get_org_context(org_id)
      MCP server: SELECT github_orgs + customers + enterprise_accounts
      Result: { org: { current_plan: 'Enterprise', billing_status: 'past_due', sso_enabled: false },
                customer: { support_tier: 'premium' },
                enterprise: { account_status: 'active', saml_enabled: true } }

    MCP → get_case_history(customer_id, 20)
      MCP server: CTE query → recent cases for Acme Corp
      Result: 1 event (this is the first case for acme-data)

    RAG → retrieveChunks("All our paid Enterprise features locked...")
      OpenAI embed → 1536-float vector
      pgvector cosine search → top-5 chunks about billing, plan management
      e.g.: "About billing for your enterprise", "Upgrading your account's plan"

    Claude claude-sonnet-4-20250514:
      System: classify and route
      User: case JSON + org (billing_status=past_due) + RAG billing docs
      Response: { "issueCategory": "billing_plan", "routeTo": ["BillingPlanAgent"] }

  emit('routing', 'Routing to: BillingPlanAgent')
  ─── Angular shows routing event with billing_plan + [BillingPlanAgent] ───

  emit('rag_retrieved', 'Retrieved 5 document chunks')

STEP 6: BillingPlanAgent.run()

  emit('agent_start', 'Starting BillingPlanAgent...')

  MCP → check_subscription(scope_type='org', scope_id=acme-data-org-id)
    Result: { plan_name: 'Enterprise', active_status: FALSE, renewal_date: '2026-06-01' }

  acme-data has enterprise_id → also:
  MCP → check_subscription(scope_type='enterprise', scope_id=acme-enterprise-id)
    Result: enterprise subscription (may or may not be active — depends on seed)

  MCP → check_invoice_status(customer_id=acme-customer-id)
    Result: { payment_status: 'overdue', amount: 21000.00, due_date: '2026-04-01' }

  Claude claude-sonnet-4-20250514:
    System: "active_status=false AND payment_status='overdue' → billing-caused access loss → resolve"
    User: case + org subscription (active=false) + invoice (overdue) + billing RAG docs
    Response:
    {
      "summary": "Subscription lapsed due to overdue invoice. Features locked as a result.",
      "rootCauses": ["Invoice overdue since 2026-04-01", "Subscription deactivated"],
      "recommendedVerdict": "resolve"
    }

  emit('agent_done', 'BillingPlanAgent complete: resolve')
  ─── Angular shows agent_done card with rootCauses ───

STEP 7: ResolutionAgent.run()

  emit('verdict', 'Synthesizing final verdict...')

  checkAutoEscalation():
    issueCategory = 'billing_plan' → not ambiguous ✓
    openEvents.length = 1 → not ≥ 3 ✓
    no SAML tool results ✓
    no entitlement tool results ✓
    forcedVerdict = null  → no override

  Aggregate evidence:
    dedupedCitations = 5 RAG chunks
    allToolResults = [get_org_context, get_case_history, check_subscription(org),
                      check_subscription(enterprise), check_invoice_status]
    allKeyFindings = ["[BillingPlanAgent] Subscription lapsed due to overdue invoice"]

  Claude claude-sonnet-4-20250514:
    System: synthesize all findings → customer_response + internal_note
    User: everything
    Response:
    {
      "verdict": "resolve",
      "key_findings": [...],
      "customer_response": "## Action Required: Payment Overdue\n\nYour GitHub Enterprise subscription...",
      "internal_note": "## Root Cause Analysis\n\nInvoice #X is overdue since April 1st..."
    }

  verdict = 'resolve' (no forced override) → no createEscalation()

  redis.set('outcome:case_id', JSON.stringify(outcome), 'EX', 86400)

  UPDATE support_cases SET status='resolved', issue_category='billing_plan' WHERE case_id=$1

  emit('complete', { verdict: 'resolve', issue_type: 'billing_plan' })
  ─── Angular receives 'complete', calls fetchOutcome() ───

STEP 8: Angular fetchOutcome()
  GET /api/cases/:id → redis.get('outcome:case_id') → JSON.parse
  outcome.set(result)
  loading.set(false)
  ─── OutcomeCardComponent renders:
       Green "RESOLVE" badge
       Customer response markdown (pay your invoice → features restored)
       Internal note (invoice details, subscription state)
       5 doc citations with source URLs
       Tool results list ───

res.end() closes SSE stream.
```

---

## 12. The 8 test scenarios

All scenarios have pre-seeded data in `packages/backend/src/db/seed.ts`.

| #   | Title                         | Seeded condition                                                                   | Which agent fires                | Expected verdict    | Why                                                                 |
| --- | ----------------------------- | ---------------------------------------------------------------------------------- | -------------------------------- | ------------------- | ------------------------------------------------------------------- |
| S1  | Feature Entitlement Dispute   | `entitlements.source = 'plan_limit'`                                               | EntitlementsAgent                | resolve             | Team plan doesn't include Actions minutes → upgrade guidance        |
| S2  | Paid Features Locked          | `subscriptions.active_status = false` + `invoices.payment_status = 'overdue'`      | BillingPlanAgent                 | resolve             | Classic billing-caused lockout → pay invoice                        |
| S3  | PAT Failing for Org Resources | `token_records.sso_authorized = false` + org has SSO                               | AuthTokenAgent                   | resolve             | Token not SSO-authorized → authorize it                             |
| S4  | REST API Rate Limit           | `api_usage.throttled_requests > 0` (24h window)                                    | ApiRateLimitAgent                | resolve             | Real throttling → backoff + caching guidance                        |
| S5  | SAML SSO Login Failure        | `saml_configs.certificate_expiry` in future or past                                | AuthTokenAgent                   | resolve or escalate | If cert expired → escalate; if active → resolve                     |
| S6  | Repeated Auth Issues          | 3+ `case_history` events for auth cases                                            | AuthTokenAgent → ResolutionAgent | escalate (auto)     | checkAutoEscalation() fires: openEvents.length ≥ 3                  |
| S7  | Ambiguous Complaint           | No specific data; description is "GitHub not working"                              | OrchestratorAgent                | clarify             | Claude classifies as 'ambiguous' → ResolutionAgent forces 'clarify' |
| S8  | Billing + Technical Issue     | Enterprise upgrade recent; `entitlements.source='not_found'` for Advanced Security | BillingPlanAgent                 | resolve or escalate | Missing entitlement record → auto-escalation in ResolutionAgent     |

---

## 13. Error handling strategy

Every error in the system is typed. Plain `new Error()` is never thrown. The class hierarchy:

```
AppError (base)
  ├── DatabaseError   — any pg pool.query() failure
  ├── McpToolError    — any MCP tool call failure (wraps the tool name for debugging)
  ├── ValidationError — Zod safeParse failure, bad HTTP input
  ├── AgentError      — LLM call failure, JSON parse failure in agent (wraps agent name)
  └── RagError        — OpenAI embedding failure, pgvector query failure
```

**How errors flow:**

1. A `DatabaseError` is thrown inside `mcp-server/src/server.ts` as a `McpToolError`
2. `McpClient.callTool()` catches it and re-throws as `McpToolError`
3. The agent catches it and re-throws as `AgentError`
4. `runPipeline()` catches it and emits an `'error'` SSE event
5. The Express error handler middleware receives it, checks `instanceof AppError`, returns the appropriate HTTP status

**Why chain errors with `{ cause }` option?** Node.js error chaining (`new Error(msg, { cause: err })`) preserves the full stack trace. When Pino logs the error, it logs the entire cause chain so you can see exactly which SQL failed and why.

---

## 14. Key technology decisions

| Decision                            | Why                                                                                                                                                                                                                                                                |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **ESM only** (`"type": "module"`)   | Node 24 supports native ESM. No `require()`, no CommonJS interop hacks. `node:` prefix for built-ins (explicit, no ambiguity with npm packages).                                                                                                                   |
| **TypeScript strict mode**          | `strict: true` catches null checks, implicit any, unused variables at compile time — not at runtime in production.                                                                                                                                                 |
| **`tsx` for development**           | `tsx` directly executes TypeScript without a separate compile step. Faster feedback loop than `tsc && node`.                                                                                                                                                       |
| **`tsc` for production**            | Building to `dist/` with `tsc` produces pure JavaScript that Node can run without TypeScript overhead.                                                                                                                                                             |
| **Zod for all external boundaries** | HTTP request bodies, env vars, MCP tool inputs are all external. Zod validates and narrows types at the boundary so the rest of the code is type-safe without runtime `instanceof` checks.                                                                         |
| **Pino for logging**                | Pino is the fastest Node.js logger. Structured JSON output (key-value pairs) is searchable in log aggregation tools. `pino-pretty` reformats it for human reading in dev. `logger.child({})` creates namespaced loggers without duplicating config.                |
| **pgvector extension**              | Adds vector column type and efficient cosine similarity search to Postgres. Avoids needing a separate vector DB (Pinecone, Weaviate). One less infrastructure component.                                                                                           |
| **IVFFlat index**                   | Approximate nearest-neighbor search. For 1M+ vectors it's much faster than exact search. For our dev dataset it ensures recall doesn't degrade as more docs are ingested.                                                                                          |
| **Redis for caching**               | Pipeline results are expensive (3–6 LLM calls, multiple DB queries). Redis with a 24h TTL means the second request for the same case is instant. Also stores the SSE event list for replay.                                                                        |
| **MCP protocol**                    | Separates data access (MCP server) from reasoning (agents). Standard protocol means the MCP server could be reused by other clients (Claude Desktop, other agents).                                                                                                |
| **SSE for pipeline streaming**      | Server-Sent Events are simpler than WebSockets for unidirectional streaming. Native browser support. Angular's frontend doesn't need a library — just `fetch()` + `ReadableStream`.                                                                                |
| **Zoneless Angular**                | Angular 21 supports zoneless change detection. Signals + OnPush provides fine-grained reactivity without Zone.js patching async APIs globally. Smaller bundle, faster runtime.                                                                                     |
| **`claude-sonnet-4-20250514`**      | Claude claude-sonnet-4-20250514 is the specified model for all LLM calls. It's used for classification, feature name extraction, token ID extraction, specialist analysis, and final synthesis. All calls follow the exact same SDK pattern to ensure consistency. |
| **`text-embedding-3-small`**        | OpenAI's 1536-dimension embedding model. Good quality-to-cost ratio. Must be the same model at ingest and retrieval.                                                                                                                                               |

---

## 15. Environment variables reference

All validated at startup in `packages/backend/src/config/env.ts`.

| Variable            | Required | Default                 | Purpose                                                          |
| ------------------- | -------- | ----------------------- | ---------------------------------------------------------------- |
| `DATABASE_URL`      | Yes      | —                       | PostgreSQL connection string                                     |
| `REDIS_URL`         | Yes      | —                       | Redis connection URL                                             |
| `ANTHROPIC_API_KEY` | Yes      | —                       | Claude API access                                                |
| `OPENAI_API_KEY`    | Yes      | —                       | OpenAI embeddings API                                            |
| `MCP_SERVER_PATH`   | Yes      | —                       | Relative path from `packages/backend/` to compiled MCP server JS |
| `PORT`              | No       | `3000`                  | Express server port                                              |
| `ALLOWED_ORIGIN`    | No       | `http://localhost:4200` | CORS allowed origin                                              |
| `LOG_LEVEL`         | No       | `debug`                 | Pino log level                                                   |
| `ADMIN_API_KEY`     | No       | `dev-admin-key`         | Guard for `POST /api/ingest`                                     |
| `NODE_ENV`          | No       | `development`           | Affects Pino pretty-printing                                     |

---

## 16. File-by-file reference map

### `packages/backend/src/`

| File                               | What it does                                                                                           |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------ |
| `index.ts`                         | Entry point. Starts Express, registers shutdown handlers.                                              |
| `config/env.ts`                    | Zod schema for all env vars. Module-level constant `env`.                                              |
| `errors/index.ts`                  | All typed error classes: AppError, DatabaseError, McpToolError, ValidationError, AgentError, RagError. |
| `types/index.ts`                   | ALL shared TypeScript interfaces. Never duplicated elsewhere.                                          |
| `lib/database.ts`                  | `pg.Pool` singleton. `query<T>()` and `queryOne<T>()` helpers that wrap errors as `DatabaseError`.     |
| `lib/redis.ts`                     | `ioredis` client singleton. Exported as `redis`.                                                       |
| `lib/logger.ts`                    | Pino instance configured from env. Exported as `logger`.                                               |
| `lib/mcp-client.ts`                | Lazy-connecting MCP client. `callTool(name, args)` spawns MCP server process on first call.            |
| `rag/ingest.ts`                    | Fetches 22 GitHub doc URLs, HTML→Markdown, chunks, embeds, upserts to `document_chunks`.               |
| `rag/retrieve.ts`                  | Embeds a query string, runs pgvector cosine search, returns top-N `RagChunk[]`.                        |
| `agents/orchestrator.agent.ts`     | Classifies ticket, fetches org context + case history + RAG, returns `CaseContext`.                    |
| `agents/billing-plan.agent.ts`     | Checks subscription + invoice, Claude analysis → `AgentFinding`.                                       |
| `agents/entitlements.agent.ts`     | Extracts feature name, checks entitlement + subscription, Claude analysis → `AgentFinding`.            |
| `agents/auth-token.agent.ts`       | Extracts token ID, checks token + SAML config + history, Claude analysis → `AgentFinding`.             |
| `agents/api-rate-limit.agent.ts`   | Checks API usage (1h + 24h) + service status, Claude analysis → `AgentFinding`.                        |
| `agents/resolution.agent.ts`       | Auto-escalation rules, aggregates all evidence, Claude synthesis → `CaseOutcome`.                      |
| `tools/escalation.tool.ts`         | `createEscalation()` — directly inserts into `escalations` table.                                      |
| `tools/service-status.tool.ts`     | `checkServiceStatus()` — reads `service_status` + `incidents` tables directly.                         |
| `api/app.ts`                       | Creates Express app with CORS, logging, routes, error handler.                                         |
| `api/cases.router.ts`              | All HTTP routes + `runPipeline()` function.                                                            |
| `api/middleware/error-handler.ts`  | Typed error → HTTP response mapping.                                                                   |
| `api/middleware/request-logger.ts` | Per-request Pino logging.                                                                              |
| `db/schema.sql`                    | Complete PostgreSQL schema: 16 tables, indexes, constraints.                                           |
| `db/seed.ts`                       | Seeds all 8 scenario test cases with realistic data.                                                   |

### `packages/mcp-server/src/`

| File        | What it does                                                                     |
| ----------- | -------------------------------------------------------------------------------- |
| `server.ts` | 8 MCP tools over StdioServerTransport. All Zod-validated, all parameterized SQL. |
| `db.ts`     | `pg.Pool` for the MCP server process (separate from backend pool).               |
| `errors.ts` | `McpToolError` class (local copy — MCP server can't import from backend).        |
| `logger.ts` | Pino instance for MCP server process.                                            |

### `packages/frontend/src/app/`

| File                                    | What it does                                                            |
| --------------------------------------- | ----------------------------------------------------------------------- |
| `app.config.ts`                         | Angular providers: zoneless, animations, HttpClient, router.            |
| `app.routes.ts`                         | 3 lazy-loaded routes: `/`, `/cases/:id`, `/scenarios`.                  |
| `app.component.ts`                      | Root component with nav bar.                                            |
| `core/services/case.service.ts`         | HttpClient wrapper for case CRUD and outcome fetch.                     |
| `core/services/event-source.service.ts` | SSE streaming via fetch+ReadableStream + native EventSource for replay. |
| `features/case-submit/`                 | Form to create a new support case.                                      |
| `features/case-detail/`                 | Live pipeline view: SSE event list + outcome display.                   |
| `features/scenario-runner/`             | Grid of 8 scenario cards with run buttons.                              |
| `shared/components/agent-event-card/`   | Renders one SSE AgentEvent as a Material card.                          |
| `shared/components/outcome-card/`       | Renders CaseOutcome: verdict badge, markdown responses, citations.      |
| `types/index.ts`                        | Frontend-side TypeScript types mirroring backend types.                 |

---

_This document reflects the state of the codebase at Phase 7 (all phases complete). The system is fully functional end-to-end: infrastructure → RAG → MCP → agents → API → Angular UI._
