# MCP Server Skill

## Location & Transport

```
packages/mcp-server/src/server.ts
Transport: StdioServerTransport  (spawned as child process by backend)
```

The backend spawns the MCP server via `MCP_SERVER_PATH` env var pointing to `dist/server.js`.

---

## Boilerplate

```typescript
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { pool } from './db.js';
import { logger } from './logger.js';
import { McpToolError } from './errors.js';

const server = new McpServer({ name: 'github-support-mcp', version: '1.0.0' });
const transport = new StdioServerTransport();
await server.connect(transport);
```

---

## Tool Registration Pattern

```typescript
server.tool(
  'tool_name', // snake_case
  'Query PostgreSQL for ... Returns ... Use when: ...', // see description rules below
  {
    org_id: z.string().uuid().describe('GitHub org UUID'),
  },
  async ({ org_id }) => {
    const log = logger.child({ tool: 'tool_name' });
    try {
      const { rows } = await pool.query<ResultType>(
        'SELECT col1, col2 FROM table WHERE org_id = $1',
        [org_id],
      );
      const result = rows[0] ?? null;
      log.info({ org_id }, 'Tool succeeded');
      return { content: [{ type: 'text', text: JSON.stringify(result) }] };
    } catch (err) {
      throw new McpToolError('Failed to run tool_name', 'tool_name', err);
    }
  },
);
```

---

## Tool Description Rules

Every description **must** include three parts:

1. **Data source** — `"Query PostgreSQL for ..."` or `"Call [service] for ..."`
2. **Return shape** — what fields/structure is returned
3. **Trigger phrases** — `"Use when: [list of situations]"`

```
// ✅ Good
'Query PostgreSQL for GitHub org, enterprise, and customer context. ' +
'Returns org plan, billing status, SSO settings, and enterprise details. ' +
'Use when: loading account context, checking plan, checking SSO status.'

// ❌ Bad — no data source, no trigger
'Gets org info'
```

---

## Existing Tools (do not duplicate)

| Tool name              | Returns                                        |
| ---------------------- | ---------------------------------------------- |
| `get_org_context`      | org plan, billing status, SSO, enterprise info |
| `check_subscription`   | subscription tier, seat counts, renewal date   |
| `check_entitlement`    | feature flag / entitlement state for an org    |
| `get_token_record`     | OAuth/PAT token metadata and scopes            |
| `get_saml_config`      | SAML/SSO provider config for an enterprise     |
| `check_api_usage`      | per-org API rate limit counters                |
| `get_case_history`     | past support cases for an org                  |
| `check_invoice_status` | invoice payment state and amount               |

---

## Input Validation

The MCP SDK applies the Zod schema before calling the handler.
Do **not** re-validate inside the handler — the params are already typed.

```typescript
// ✅ params are typed by the schema
async ({ org_id, limit }) => {
  // org_id is string (UUID), limit is number — guaranteed by Zod
};
```

---

## Error Class

```typescript
// packages/mcp-server/src/errors.ts (or imported from backend errors)
throw new McpToolError(
  'Human-readable message describing what failed',
  'tool_name', // must match the registered tool name
  originalError, // the caught err — never swallow it
);
```

---

## Return Format

Always use this exact shape — the MCP SDK requires it:

```typescript
return {
  content: [{ type: 'text', text: JSON.stringify(result) }],
};
```

Never return raw objects, arrays, or multiple content items for tool results.

---

## SQL Rules

- Parameterized queries **only** — `$1, $2, $3`
- Never template literals inside SQL strings
- Use explicit column lists — never `SELECT *` in production tools

```typescript
// ✅
await pool.query('SELECT org_id, plan FROM orgs WHERE org_id = $1', [orgId]);

// ❌
await pool.query(`SELECT * FROM orgs WHERE org_id = '${orgId}'`);
```
