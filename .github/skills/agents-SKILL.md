# Agents Skill

## Pipeline

```
OrchestratorAgent
  ├── BillingPlanAgent    (scenarios 2, 8)
  ├── EntitlementsAgent   (scenario 1)
  ├── AuthTokenAgent      (scenarios 3, 5, 6)
  └── ApiRateLimitAgent   (scenario 4)
        └── ResolutionAgent  (always last)
```

---

## Agent File Template

```typescript
// packages/backend/src/agents/<name>.agent.ts
import type { CaseContext, AgentFinding } from '../types/index.js';
import { AgentError } from '../errors/index.js';
import { logger } from '../lib/logger.js';

export class NameAgent {
  private log = logger.child({ agent: 'NameAgent' });

  async run(context: CaseContext): Promise<AgentFinding> {
    this.log.info({ case_id: context.caseInput.case_id }, 'Agent started');
    try {
      // 1. Call MCP tool(s)
      // 2. Retrieve RAG chunks
      // 3. Build prompt + call Claude Sonnet
      // 4. Parse response and return AgentFinding
    } catch (err) {
      throw new AgentError('NameAgent failed', 'NameAgent', err);
    }
  }
}
```

---

## Agent → MCP Tool Map

| Agent             | MCP tools                                    |
| ----------------- | -------------------------------------------- |
| BillingPlanAgent  | `check_subscription`, `check_invoice_status` |
| EntitlementsAgent | `check_entitlement`, `check_subscription`    |
| AuthTokenAgent    | `get_token_record`, `get_saml_config`        |
| ApiRateLimitAgent | `check_api_usage`                            |
| ResolutionAgent   | none — calls `create_escalation` direct tool |

---

## Anthropic SDK Call — Copy Exactly

```typescript
import Anthropic from '@anthropic-ai/sdk';

const anthropic = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });

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

Never use `stream: true`, `tools:`, or alternative model names unless explicitly required.

---

## AgentFinding Shape

```typescript
// From packages/backend/src/types/index.ts — never re-declare inline
interface AgentFinding {
  agent: AgentType; // e.g. 'BillingPlanAgent'
  verdict: CaseVerdict; // 'resolve' | 'clarify' | 'escalate'
  confidence: number; // 0.0 – 1.0
  summary: string; // 1-3 sentence human-readable finding
  evidence: RagChunk[]; // supporting RAG chunks
}
```

---

## System Prompt Guidelines

Each agent's system prompt must:

1. State the agent's **domain** (billing, auth, etc.)
2. List the **MCP tool results** it received (as JSON in the user message)
3. List the **RAG chunks** it retrieved
4. Ask Claude to return **structured JSON** matching `AgentFinding`
5. Instruct Claude to cite evidence by `chunk_id`

```typescript
const systemPrompt = `You are the BillingPlanAgent for GitHub Enterprise support.
Your job: analyse billing and plan data to determine whether a support case can be resolved, needs clarification, or must be escalated.

Return ONLY valid JSON matching this schema:
{
  "verdict": "resolve" | "clarify" | "escalate",
  "confidence": <0.0-1.0>,
  "summary": "<1-3 sentence finding>"
}`;

const userContent = `
## Case
${JSON.stringify(context.caseInput, null, 2)}

## Subscription data (from MCP)
${JSON.stringify(subscriptionData, null, 2)}

## Relevant documentation
${ragChunks.map((c) => `[${c.chunk_id}] ${c.section_heading}\n${c.chunk_text}`).join('\n\n')}
`;
```

---

## Error Rules

```typescript
// ✅ always AgentError in agent code
throw new AgentError(
  'BillingPlanAgent failed to parse LLM response',
  'BillingPlanAgent',
  err,
);

// ❌ never plain Error
throw new Error('agent failed');
```

---

## File Naming

```
packages/backend/src/agents/billing-plan.agent.ts
packages/backend/src/agents/entitlements.agent.ts
packages/backend/src/agents/auth-token.agent.ts
packages/backend/src/agents/api-rate-limit.agent.ts
packages/backend/src/agents/resolution.agent.ts
packages/backend/src/agents/orchestrator.agent.ts
```
