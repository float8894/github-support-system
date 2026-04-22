---
mode: 'agent'
description: 'Scaffold a new specialist agent in the backend'
---

Create a new agent in `packages/backend/src/agents/`.

## Rules

Follow every convention in [.github/copilot/copilot-instructions.md](../copilot/copilot-instructions.md).

1. **File name**: `<agent-name>.agent.ts` (kebab-case)
2. **Class name**: `<AgentName>Agent` (PascalCase)
3. **Input / Output**: always `CaseContext` → `AgentFinding` (from [packages/backend/src/types/index.ts](../../packages/backend/src/types/index.ts))
4. **Logger**: `logger.child({ agent: '<AgentName>Agent' })`
5. **Error**: throw `AgentError(message, '<AgentName>Agent', cause)` only
6. **Never** use `any`. Use `unknown` + type guards where needed.
7. Agent body must follow this exact order:
   a. Call MCP tool(s) via the injected MCP client
   b. Retrieve RAG chunks via `ragRetrieve()`
   c. Build a prompt and call Claude Sonnet with the exact SDK pattern
   d. Parse the response and return `AgentFinding`

## Agent → MCP Tool map

| Agent             | MCP tools to call                         |
| ----------------- | ----------------------------------------- |
| BillingPlanAgent  | check_subscription, check_invoice_status  |
| EntitlementsAgent | check_entitlement, check_subscription     |
| AuthTokenAgent    | get_token_record, get_saml_config         |
| ApiRateLimitAgent | check_api_usage                           |
| ResolutionAgent   | (no MCP — calls create_escalation direct) |

## Template

```typescript
import type { CaseContext, AgentFinding } from '../types/index.js';
import { AgentError } from '../errors/index.js';
import { logger } from '../lib/logger.js';

export class ${1:Name}Agent {
  private log = logger.child({ agent: '${1:Name}Agent' });

  async run(context: CaseContext): Promise<AgentFinding> {
    this.log.info({ case_id: context.caseInput.case_id }, 'Agent started');
    try {
      // 1. Call MCP tool(s)

      // 2. Retrieve RAG chunks

      // 3. Build prompt + call Claude

      // 4. Return AgentFinding
      return {
        agent: '${1:Name}Agent',
        verdict: 'resolve',
        confidence: 0.9,
        summary: '',
        evidence: [],
      };
    } catch (err) {
      throw new AgentError('${1:Name}Agent failed', '${1:Name}Agent', err);
    }
  }
}
```

## Anthropic SDK call (copy exactly)

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

## What to build

Scaffold the agent `${input:agentName}`. Infer which MCP tools it should call
from the table above. Implement a real system prompt that matches the agent's
domain. Do not leave `// TODO` stubs.
