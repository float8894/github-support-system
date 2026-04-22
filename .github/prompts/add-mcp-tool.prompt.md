---
mode: 'agent'
description: 'Scaffold a new MCP tool in the github-support MCP server'
---

Add a new MCP tool to [packages/mcp-server/src/server.ts](../../packages/mcp-server/src/server.ts).

## Rules

Follow every convention in [.github/copilot/copilot-instructions.md](../copilot/copilot-instructions.md).

1. **Tool name** must be `snake_case`.
2. **Description** must start with `"Query PostgreSQL for..."` or `"Call [service] for..."` and state:
   - Data source
   - Return shape
   - Trigger phrases (`Use when: ...`)
3. **Input schema** — Zod only. Every field needs `.describe(...)`.
4. **Implementation** must:
   - Validate with Zod (already done by MCP SDK via the schema arg)
   - Query DB with `$1, $2` parameterized SQL — never string interpolation
   - Return `{ content: [{ type: 'text', text: JSON.stringify(result) }] }`
   - Throw `McpToolError(message, toolName, cause)` on any failure
5. Tool descriptions must **not** overlap with existing tools:
   - `get_org_context` — org/enterprise/plan/SSO context
   - `check_subscription` — subscription tier and seat counts
   - `check_entitlement` — feature flag / entitlement lookup
   - `get_token_record` — OAuth/PAT token metadata
   - `get_saml_config` — SAML/SSO provider config
   - `check_api_usage` — per-org API rate limit counters
   - `get_case_history` — past support cases for an org
   - `check_invoice_status` — invoice payment state

## Template

```typescript
server.tool(
  '<tool_name>',
  'Query PostgreSQL for ... Returns ... Use when: ...',
  {
    param_one: z.string().uuid().describe('Description of param_one'),
  },
  async ({ param_one }) => {
    const log = logger.child({ tool: '<tool_name>' });
    try {
      const { rows } = await pool.query<{
        /* result type */
      }>('SELECT ... FROM ... WHERE col = $1', [param_one]);
      const result = rows[0] ?? null;
      log.info({ param_one }, 'Tool succeeded');
      return { content: [{ type: 'text', text: JSON.stringify(result) }] };
    } catch (err) {
      throw new McpToolError('Failed to run <tool_name>', '<tool_name>', err);
    }
  },
);
```

## What to build

Add the tool `${input:toolName}` to the MCP server. Infer a sensible description,
input schema, and SQL query from the tool name. Do not add stub `// TODO` comments.
