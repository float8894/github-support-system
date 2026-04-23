# CLAUDE.md — GitHub Support Resolution System

This file is read by Claude Code automatically at the start of every session.
It provides repo-wide context, conventions, and phase-aware guidance.

## Project Overview

Multi-agent GitHub support resolution system. Takes an incoming support case,
gathers evidence via RAG + MCP tools, and decides: resolve / clarify / escalate.

**Current phase:** Update this line when you advance a phase.
CURRENT_PHASE=7

## Monorepo Layout

```
packages/
  backend/      Node 24 + TypeScript — agents, RAG, Express API
  mcp-server/   Standalone MCP stdio process (spawned by backend)
  frontend/     Angular 21 standalone — support agent dashboard
```

Run everything:

```bash
docker compose up -d              # Postgres+pgvector + Redis
npm run dev --workspace=packages/backend
npm run dev --workspace=packages/mcp-server
npm run dev --workspace=packages/frontend
```

## Commands Claude Code Should Know

```bash
# Install
npm install                                  # all workspaces

# Dev
npm run dev -w packages/backend              # tsx watch
npm run dev -w packages/mcp-server           # tsx watch
npm run dev -w packages/frontend             # ng serve

# Build
npm run build -w packages/backend            # tsc
npm run build -w packages/mcp-server         # tsc
npm run build -w packages/frontend           # ng build

# Test
npm run test -w packages/backend             # vitest
npm run test -w packages/frontend            # vitest

# RAG ingestion
npm run ingest -w packages/backend           # tsx src/rag/ingest.ts

# DB
docker compose exec db psql -U postgres -d github_support
npm run db:migrate -w packages/backend       # runs schema.sql
npm run db:seed -w packages/backend          # runs seed.ts

# Type check all packages
npm run typecheck --workspaces
```

## Strict Rules — Never Break These

- ESM only. `"type": "module"` in every package.json. Never `require()`.
- `node:` prefix for all Node built-ins. (`node:crypto`, `node:fs/promises`)
- Never `ts-node`. Dev uses `tsx`. Build uses `tsc`.
- Never `any` in TypeScript. Use `unknown` + type guards.
- Never `console.log` — use `pino` logger from `src/lib/logger.ts`.
- Never string interpolation in SQL. Always `$1, $2` parameterized queries.
- All env vars validated with Zod in `src/config/env.ts` before use.
- All IDs via `randomUUID()` from `node:crypto`.
- All errors thrown as typed subclasses from `src/errors/index.ts`.
- Angular: `standalone: true`, `OnPush`, `inject()`, `signal()` everywhere.

## Error Classes (packages/backend/src/errors/index.ts)

Use the correct class — never throw plain `new Error()`:

| Class           | When to use                         |
| --------------- | ----------------------------------- |
| DatabaseError   | Any pg query failure                |
| McpToolError    | Any MCP tool call failure           |
| ValidationError | Zod parse failure, bad input        |
| AgentError      | Agent reasoning or LLM call failure |
| RagError        | Embedding or vector search failure  |

## Shared Types

All interfaces live in `packages/backend/src/types/index.ts`.
Never re-declare `CaseContext`, `AgentFinding`, `CaseOutcome`, `RagChunk`,
`ToolResult`, `SupportCase`, `AgentEvent` inline — always import from types.

## Phase Gate — What's In Scope

| Phase | Scope                          | Key files                           |
| ----- | ------------------------------ | ----------------------------------- |
| 1     | Monorepo, schema, seed, config | schema.sql, env.ts, errors/, types/ |
| 2     | RAG ingestion + retrieval      | rag/ingest.ts, rag/retrieve.ts      |
| 3     | MCP server + 8 tools           | mcp-server/src/server.ts            |
| 4     | All 6 agents + direct tools    | agents/_.ts, tools/_.ts             |
| 5     | Express API + SSE streaming    | api/app.ts, api/cases.router.ts     |
| 6     | Angular dashboard              | frontend/src/app/\*\*               |
| 7     | Scenarios, README, docs        | SCENARIOS.md, README.md             |

When asked to build something, check CURRENT_PHASE above.
If the request is for a future phase, say so and ask for confirmation.

## Agent → Scenario Map

| Agent             | Scenarios | Key MCP tools                                   |
| ----------------- | --------- | ----------------------------------------------- |
| OrchestratorAgent | all       | get_org_context, get_case_history               |
| BillingPlanAgent  | 2, 8      | check_subscription, check_invoice_status        |
| EntitlementsAgent | 1         | check_entitlement, check_subscription           |
| AuthTokenAgent    | 3, 5, 6   | get_token_record, get_saml_config               |
| ApiRateLimitAgent | 4         | check_api_usage + check_service_status (direct) |
| ResolutionAgent   | all       | create_escalation (direct, if escalating)       |

## MCP Server

Location: `packages/mcp-server/src/server.ts`
Transport: `StdioServerTransport` (spawned as child process by backend)
Tools: get_org_context, check_subscription, check_entitlement, get_token_record,
get_saml_config, check_api_usage, get_case_history, check_invoice_status

Each tool must:

1. Validate input with Zod
2. Query DB with parameterized SQL
3. Return `{ content: [{ type: 'text', text: JSON.stringify(result) }] }`
4. Throw `McpToolError(msg, toolName, cause)` on failure

## RAG Retrieval SQL

Always use this exact query — never modify it:

```sql
SELECT chunk_id, source_url, section_heading, chunk_text,
  1 - (embedding <=> $1::vector) AS score
FROM document_chunks
ORDER BY embedding <=> $1::vector
LIMIT $2;
```

## Anthropic SDK Call Pattern

Always use this — never deviate:

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

## Angular Patterns (Phase 6)

Every component must have:

- `standalone: true`
- `changeDetection: ChangeDetectionStrategy.OnPush`
- `inject()` for all DI (no constructor injection)
- `signal()` / `computed()` for all reactive state
- `@if` / `@for` in templates (never `*ngIf` / `*ngFor`)
- Signal Forms (`form()` / `field()`) for any form

App config must include:

- `provideExperimentalZonelessChangeDetection()`
- `provideAnimationsAsync()`

## File Naming Conventions

Backend: `kebab-case.agent.ts`, `kebab-case.tool.ts`, `kebab-case.router.ts`
Frontend: `kebab-case.component.ts/html/scss/spec.ts` (one folder per component)
Tests: `*.spec.ts` colocated, Vitest syntax everywhere

## Environment Variables

Required (validated at startup by Zod in src/config/env.ts):

```
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/github_support
REDIS_URL=redis://localhost:6379
ANTHROPIC_API_KEY=sk-ant-...
OPENAI_API_KEY=sk-...
PORT=3000
NODE_ENV=development
MCP_SERVER_PATH=../mcp-server/dist/server.js
```

## Dependency Versions

```json
{
  "@anthropic-ai/sdk": "^0.39.0",
  "@modelcontextprotocol/sdk": "^1.10.0",
  "openai": "^4.87.0",
  "express": "^5.0.0",
  "pg": "^8.13.0",
  "pgvector": "^0.2.0",
  "ioredis": "^5.3.0",
  "pino": "^9.0.0",
  "pino-pretty": "^13.0.0",
  "zod": "^3.24.0",
  "turndown": "^7.2.0",
  "node-fetch": "^3.3.0",
  "tsx": "^4.19.0"
}
```

## Useful Shortcuts for Claude Code

| When I say...      | Do this                                              |
| ------------------ | ---------------------------------------------------- |
| "scaffold phase N" | Generate all files listed for that phase             |
| "run scenario N"   | Execute test with pre-seeded scenario data           |
| "check types"      | Run `npm run typecheck --workspaces`                 |
| "ingest docs"      | Run `npm run ingest -w packages/backend`             |
| "reset db"         | Drop + recreate schema, re-run seed                  |
| "add tool <name>"  | Add to mcp-server/src/server.ts with Zod schema      |
| "add agent <name>" | Scaffold agent class in packages/backend/src/agents/ |
