---
mode: 'agent'
description: 'Scaffold all files for a project phase'
---

Generate all source files required for the requested phase of the
GitHub Support Resolution System.

Refer to the phase gate table and file list in
[.github/copilot/copilot-instructions.md](../copilot/copilot-instructions.md)
and [CLAUDE.md](../../.claude/CLAUDE.md) before generating any code.

## Phase Gate

| Phase | Scope                          | Key output files                                    |
| ----- | ------------------------------ | --------------------------------------------------- |
| 1     | Monorepo, schema, seed, config | schema.sql, env.ts, errors/index.ts, types/index.ts |
| 2     | RAG ingestion + retrieval      | rag/ingest.ts, rag/retrieve.ts                      |
| 3     | MCP server + 8 tools           | mcp-server/src/server.ts                            |
| 4     | All 6 agents + direct tools    | agents/_.agent.ts, tools/_.tool.ts                  |
| 5     | Express API + SSE streaming    | api/app.ts, api/cases.router.ts                     |
| 6     | Angular dashboard              | frontend/src/app/\*\*                               |
| 7     | Scenarios, README, docs        | SCENARIOS.md, README.md                             |

## Rules — apply to every generated file

- ESM only. `"type": "module"` in every package.json. Never `require()`.
- `node:` prefix for all Node built-ins.
- No `any` — use `unknown` + type guards.
- No `console.log` — use `pino` logger from `src/lib/logger.ts`.
- Parameterized SQL only — `$1, $2`, never template literals in queries.
- All IDs via `randomUUID()` from `node:crypto`.
- All errors are typed subclasses from `src/errors/index.ts`.
- All env vars validated with Zod in `src/config/env.ts`.
- Angular: `standalone: true`, `OnPush`, `inject()`, `signal()` everywhere.
- Tests: Vitest, colocated `*.spec.ts` files.

## What to build

Scaffold **phase ${input:phaseNumber}** completely. Create every file listed for
that phase. For phases that depend on previous phases, import from the already
existing modules. Do not add placeholder `// TODO` comments — implement real logic.

After scaffolding, output a checklist of created files.
