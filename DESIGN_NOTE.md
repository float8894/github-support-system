# Design Note — GitHub Support Resolution System

This document records the key architectural decisions made during the design and
implementation of the multi-agent GitHub support resolution system.

---

## 1. System Overview

The system receives an inbound support case (title + description + severity) from a
GitHub Enterprise customer and produces a `CaseOutcome` containing:

- A **verdict** (`resolve` / `clarify` / `escalate`)
- A **customer-facing response** in Markdown, grounded in GitHub documentation
- An **internal engineering note** citing evidence and tooling results

The pipeline is:

```
SupportCase
  └─► OrchestratorAgent        triage + RAG + routing
        ├─► BillingPlanAgent   billing / subscription issues
        ├─► EntitlementsAgent  feature access / plan limits
        ├─► AuthTokenAgent     PAT / OAuth / SAML SSO
        └─► ApiRateLimitAgent  REST / GraphQL rate limits
              └─► ResolutionAgent (always last)
                    └─► CaseOutcome
```

All agents share a `CaseContext` that accumulates evidence from the MCP server
(structured entity data), the RAG layer (GitHub Docs), and each agent's
`AgentFinding`.

---

## 2. Why Multi-Agent Rather Than a Single LLM Call

A single prompt containing the full entity graph plus documentation corpus would:

- Exceed context limits for complex cases with many MCP results
- Lose precision — billing rules and token validation rules would interfere
- Produce undifferentiated reasoning that is difficult to audit

Each specialist agent owns a narrowly scoped prompt with:

- Only the MCP tools relevant to its domain
- Only the agent-specific decision rules
- A structured `AgentFinding` output type with `rootCauses`, `recommendedVerdict`,
  and typed `evidence`

The `ResolutionAgent` receives all findings and synthesises them into a final
`CaseOutcome`. This separation means that each agent's logic can be tested in
isolation (Scenario 1 → EntitlementsAgent only, Scenario 4 → ApiRateLimitAgent
only) and the prompts stay short and auditable.

---

## 3. OrchestratorAgent: Classify and Route Only

The `OrchestratorAgent` deliberately does **not** resolve cases. It performs three
tasks:

1. **`get_org_context`** — fetches plan, enterprise membership, SSO state via MCP
2. **`get_case_history`** — fetches previous cases for the same customer via MCP
3. **RAG retrieval** — retrieves top-5 cosine-similar documentation chunks

It then calls the LLM once to classify into one of six `IssueCategory` values and
produce a `routeTo` array of specialist `AgentType`s.

The rationale for keeping orchestration separate from resolution:

- Classification is structurally different from resolution (routing vs. answering)
- The orchestrator has no domain knowledge about billing rules or token states
- Keeping it stateless makes it easy to re-classify if a case is re-opened
- It guarantees every case gets RAG grounding before any specialist agent runs

---

## 4. MCP Server as Standalone stdio Process

The MCP server (`packages/mcp-server/src/server.ts`) runs as a child process
spawned by the backend via `StdioServerTransport`. This was chosen over:

- **In-process module calls** — would couple the MCP tool layer to the Express
  process, preventing independent deployment or testing
- **HTTP microservice** — adds network latency and operational complexity for what
  is fundamentally a structured database-query layer

The stdio transport is the canonical MCP pattern for tool-calling agents. Each tool
validates its input with Zod, executes a single parameterised SQL query, and returns
`{ content: [{ type: 'text', text: JSON.stringify(result) }] }`. Tool failures
throw `McpToolError` which the agent layer catches and records in `ToolResult.error`.

The eight tools map directly to database tables, providing a stable contract
regardless of internal schema evolution:

| Tool                   | Primary table                                       |
| ---------------------- | --------------------------------------------------- |
| `get_org_context`      | `github_orgs` + `enterprise_accounts` + `customers` |
| `check_subscription`   | `subscriptions`                                     |
| `check_entitlement`    | `entitlements`                                      |
| `get_token_record`     | `token_records`                                     |
| `get_saml_config`      | `saml_configs`                                      |
| `check_api_usage`      | `api_usage`                                         |
| `get_case_history`     | `case_history` + `support_cases`                    |
| `check_invoice_status` | `invoices`                                          |

---

## 5. RAG Corpus Design

**Why RAG at all?** The LLM has general knowledge of GitHub, but that knowledge
may be stale and cannot cite specific documentation sections. Requiring every
`CaseOutcome` to have non-empty `evidence.doc_citations` forces the resolution to
be grounded in authoritative content.

**Corpus selection:** 22 GitHub Docs URLs were chosen to cover all eight scenario
types: billing & plans, Actions entitlements, PAT / OAuth / SAML auth, API rate
limits, and enterprise features. The URLs were fetched via `node-fetch`, converted
to Markdown with `turndown`, and chunked at ~500 tokens with a 50-token overlap to
preserve sentence context across chunk boundaries.

**Embedding model:** OpenAI `text-embedding-3-small` (1536 dimensions) was chosen
for cost efficiency. The alternative (`text-embedding-3-large`, 3072 dims) offers
marginal improvements in retrieval quality that are unlikely to matter for a corpus
of this size.

**Retrieval SQL:** A fixed canonical query using pgvector's `<=>` cosine distance
operator with an ivfflat index (lists=100) returns top-5 chunks. The index was
chosen over hnsw because the corpus is small (< 10,000 chunks) and ivfflat has
lower memory overhead. The canonical query is never modified — all tuning is done
via `limit`.

---

## 6. Auto-Escalation Rules

Three conditions trigger unconditional escalation regardless of the LLM's
recommended verdict. All three are implemented in `ResolutionAgent`:

### Rule 1 — Repeated unresolved history (Scenario 6)

```
caseHistory.events where same issue_category, count ≥ 3, none resolved → ESCALATE
```

The orchestrator fetches the last 20 case history events. If the same customer has
three or more open/unresolved cases in the same category as the current case, the
resolution agent escalates without attempting to resolve. This prevents the system
from giving the same resolution advice repeatedly.

### Rule 2 — SAML certificate expiry

```
saml_config.certificate_expiry < now() → ESCALATE
```

An expired SAML certificate requires a manual certificate rotation by a GitHub
Enterprise administrator. This is not self-serviceable by the customer and is
always escalated with the certificate expiry date in the internal note.

### Rule 3 — Entitlement source `not_found`

```
entitlement.source = 'not_found' → ESCALATE
```

When an entitlement is `not_found` (as opposed to `plan_limit` or
`admin_disabled`), the feature is absent from the customer's entitlement record
entirely. This indicates a provisioning error rather than a plan limitation and
requires manual intervention by the billing team.

---

## 7. MCP Tools vs. Direct Tools

Most evidence-gathering happens via the MCP server. Two tools bypass MCP and are
called directly from agent code:

| Tool                   | Location                       | Reason for direct call                                                                                                                            |
| ---------------------- | ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| `check_service_status` | `tools/service-status.tool.ts` | Read-only DB query not exposed via MCP; called by ApiRateLimitAgent before checking usage metrics                                                 |
| `create_escalation`    | `tools/escalation.tool.ts`     | Write operation (inserts into `escalations` table); exposing write tools via MCP would violate the principle that MCP tools are read-only queries |

The MCP server exposes only read-only SELECT queries. All write operations
(`INSERT INTO escalations`) are direct calls within the agent process boundary
where transaction semantics and error handling can be applied directly.

---

## 8. SSE Streaming Design

The Express route `POST /api/cases/:id/run` starts the agent pipeline and
immediately streams `AgentEvent` objects via Server-Sent Events. This gives the
frontend live visibility into:

- `triage` — OrchestratorAgent classification result
- `routing` — which specialist agents will run
- `agent_start` / `agent_done` — specialist agent lifecycle
- `rag_retrieved` — number of documentation chunks found
- `tool_called` — each MCP tool invocation
- `verdict` — ResolutionAgent's final verdict
- `complete` — full `CaseOutcome` payload
- `error` — any agent or tool failure

The complete `CaseOutcome` is stored in Redis (keyed by `case_id`) for the
duration of the session and persisted to the `support_cases` + `case_history`
tables so that `GET /api/cases/:id` can return it after the stream closes.

Redis was chosen as the SSE buffer rather than polling the database because:

- It avoids serialising the outcome JSON to Postgres on every partial event
- It provides a natural TTL for in-flight sessions without schema changes
- It decouples the streaming connection lifetime from the database transaction

---

## 9. Error Handling Philosophy

All errors are typed subclasses of `AppError`, which carries a `code` string and
HTTP `statusCode`. This means:

- The Express error handler can produce a consistent JSON error response without
  `instanceof` checks on plain `Error`
- Agent and tool errors are distinguishable in logs without parsing message strings
- `cause` chaining preserves the original database or SDK error for debugging

The hierarchy:

```
AppError
├── DatabaseError    — any pg query failure
├── McpToolError     — any MCP tool call failure (includes toolName)
├── ValidationError  — Zod parse failure, malformed input
├── AgentError       — LLM call or JSON parse failure in an agent
└── RagError         — embedding API or vector search failure
```

The system follows fail-fast semantics for configuration errors (Zod validates all
env vars at startup) and graceful degradation for runtime errors (a failing
specialist agent records an error finding, and the ResolutionAgent can still
produce a `clarify` outcome from the available evidence).
