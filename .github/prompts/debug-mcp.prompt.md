---
mode: 'agent'
description: 'Diagnose and fix MCP server connectivity or tool-call failures'
---

Debug a problem with the MCP server used by the GitHub Support Resolution System.

## MCP Server Facts

- **Location**: [packages/mcp-server/src/server.ts](../../packages/mcp-server/src/server.ts)
- **Transport**: `StdioServerTransport` — spawned as a child process by the backend
- **Config key**: `MCP_SERVER_PATH` env var → path to compiled `dist/server.js`
- **Tools**: `get_org_context`, `check_subscription`, `check_entitlement`,
  `get_token_record`, `get_saml_config`, `check_api_usage`,
  `get_case_history`, `check_invoice_status`

## Common failure modes

| Symptom                          | Likely cause                           | Fix                                              |
| -------------------------------- | -------------------------------------- | ------------------------------------------------ |
| `spawn ENOENT`                   | `dist/server.js` not built             | `npm run build -w packages/mcp-server`           |
| `McpToolError` on every call     | DB unreachable from MCP process        | Check `DATABASE_URL`, run `docker compose up -d` |
| Tool returns `null` result       | Seed data missing for org_id           | `npm run db:seed -w packages/backend`            |
| `Invalid params` from SDK        | Zod schema mismatch on tool input      | Verify UUIDs and required fields in call site    |
| Process exits immediately        | Unhandled top-level error in server.ts | Check stderr output of MCP child process         |
| Timeout waiting for MCP response | Event loop blocked by sync DB call     | Ensure all DB calls use `await pool.query(...)`  |

## Diagnostic commands

```bash
# 1. Build the MCP server
npm run build -w packages/mcp-server

# 2. Smoke-test the compiled server directly (sends a bare init message)
echo '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"debug","version":"0.0.1"}}}' \
  | node packages/mcp-server/dist/server.js

# 3. Check postgres is reachable
docker compose exec db psql -U postgres -d github_support -c "SELECT 1;"

# 4. Tail MCP server logs (if backend is running)
npm run dev -w packages/backend 2>&1 | grep '"service":"mcp"'
```

## Error class reference

```typescript
// Thrown by every failing tool:
throw new McpToolError('Human-readable message', 'tool_name', originalError);
```

Errors propagate to the calling agent as `McpToolError`.
The agent re-throws as `AgentError`. The orchestrator catches and logs both.

## What to do

Diagnose the MCP issue described by the user. Run the diagnostic commands above,
read any stack traces, identify the root cause using the table above, and apply
a fix. Show me the exact error before and after the fix.
