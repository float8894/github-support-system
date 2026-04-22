# GitHub Copilot Instructions
# Place this file at: .github/copilot-instructions.md
# Copilot reads this automatically for every file in this repo.

## Project: GitHub Support Resolution System

Multi-agent support pipeline. Node 24 + TypeScript backend, Angular 21 frontend.
Agents: OrchestratorAgent → [BillingPlanAgent | EntitlementsAgent | AuthTokenAgent | ApiRateLimitAgent] → ResolutionAgent.

---

## Language & Runtime

- Node 24, ESM only. Every package.json has `"type": "module"`.
- TypeScript strict mode, NodeNext module resolution.
- Dev: `tsx`. Build: `tsc`. Never suggest `ts-node` or `require()`.
- All Node built-in imports use `node:` prefix: `node:crypto`, `node:fs/promises`, `node:path`.

---

## Backend Patterns

### Imports
```typescript
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
// ✅ correct — never: import fs from 'fs'
```

### Logging — always Pino, never console
```typescript
import { logger } from '../lib/logger.js';
const log = logger.child({ service: 'billing-plan-agent' });
log.info({ org_id }, 'Agent invoked');
log.error({ err }, 'Tool call failed');
// ❌ never: console.log(...)
```

### SQL — always parameterized
```typescript
// ✅ correct
const rows = await pool.query(
  'SELECT * FROM support_cases WHERE org_id = $1 AND status = $2',
  [orgId, 'open']
);
// ❌ never: `SELECT * FROM support_cases WHERE org_id = '${orgId}'`
```

### Error handling — typed classes only
```typescript
import { DatabaseError, McpToolError, AgentError, RagError, ValidationError } from '../errors/index.js';

try {
  await pool.query(sql, params);
} catch (err) {
  throw new DatabaseError('Failed to fetch org context', err);
}

// In MCP tools:
throw new McpToolError('Tool failed', 'get_org_context', err);

// In agents:
throw new AgentError('Billing agent failed', 'BillingPlanAgent', err);

// ❌ never: throw new Error('something went wrong')
// ❌ never: throw 'string error'
```

### Env vars — always Zod
```typescript
import { z } from 'zod';
const envSchema = z.object({
  DATABASE_URL: z.string().url(),
  ANTHROPIC_API_KEY: z.string().min(1),
  OPENAI_API_KEY: z.string().min(1),
  PORT: z.coerce.number().default(3000),
});
export const env = envSchema.parse(process.env);
```

### IDs — always randomUUID
```typescript
import { randomUUID } from 'node:crypto';
const id = randomUUID(); // ✅
// ❌ never: Math.random(), Date.now(), nanoid without crypto
```

### Anthropic SDK — exact pattern
```typescript
const response = await anthropic.messages.create({
  model: 'claude-sonnet-4-20250514',
  max_tokens: 2048,
  system: systemPrompt,
  messages: [{ role: 'user', content: userContent }],
});
const text = response.content
  .filter(b => b.type === 'text')
  .map(b => b.text)
  .join('');
```

---

## MCP Server Patterns

Located at: `packages/mcp-server/src/server.ts`

```typescript
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';

const server = new McpServer({ name: 'github-support-mcp', version: '1.0.0' });

// Tool description MUST state: data source + return shape + trigger phrases
server.tool(
  'get_org_context',
  'Query PostgreSQL for GitHub org, enterprise, and customer context. ' +
  'Returns org plan, billing status, SSO settings, and enterprise details. ' +
  'Use when: loading account context, checking plan, checking SSO status.',
  { org_id: z.string().uuid().describe('GitHub org UUID') },
  async (params) => {
    // validate, query DB, return result
    return {
      content: [{ type: 'text', text: JSON.stringify(result) }]
    };
  }
);
```

Tool descriptions must NOT overlap. Each must start with "Query PostgreSQL for..."
or "Call [service] for..." to be unambiguous to the LLM.

---

## Agent Patterns

```typescript
// packages/backend/src/agents/billing-plan.agent.ts
import type { CaseContext, AgentFinding } from '../types/index.js';
import { AgentError } from '../errors/index.js';
import { logger } from '../lib/logger.js';

export class BillingPlanAgent {
  private log = logger.child({ agent: 'BillingPlanAgent' });

  async run(context: CaseContext): Promise<AgentFinding> {
    this.log.info({ case_id: context.caseInput.case_id }, 'Agent started');
    try {
      // 1. Call MCP tools
      // 2. Retrieve RAG chunks
      // 3. Call Claude Sonnet for reasoning
      // 4. Return AgentFinding
    } catch (err) {
      throw new AgentError('BillingPlanAgent failed', 'BillingPlanAgent', err);
    }
  }
}
```

Agent ownership:
- BillingPlanAgent   → Scenarios 2, 8  (check_subscription, check_invoice_status)
- EntitlementsAgent  → Scenario 1       (check_entitlement, check_subscription)
- AuthTokenAgent     → Scenarios 3,5,6  (get_token_record, get_saml_config)
- ApiRateLimitAgent  → Scenario 4       (check_api_usage + check_service_status)
- ResolutionAgent    → always last      (create_escalation if escalating)

---

## RAG Patterns

```typescript
// Always use this exact SQL — do not modify
const result = await pool.query<RagChunk>(
  `SELECT chunk_id, source_url, section_heading, chunk_text,
     1 - (embedding <=> $1::vector) AS score
   FROM document_chunks
   ORDER BY embedding <=> $1::vector
   LIMIT $2`,
  [embeddingArray, limit]
);
```

---

## Angular Patterns

All components must have these decorators:
```typescript
@Component({
  selector: 'app-example',
  standalone: true,          // ✅ always
  imports: [MatButtonModule, MatCardModule], // specific imports only
  templateUrl: './example.component.html',
  styleUrl: './example.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush, // ✅ always
})
export class ExampleComponent {
  private caseService = inject(CaseService); // ✅ inject() not constructor
  cases = signal<SupportCase[]>([]);          // ✅ signal not plain property
  count = computed(() => this.cases().length); // ✅ computed
}
```

Templates — use new control flow:
```html
@if (loading()) {
  <mat-spinner />
} @else if (cases().length) {
  @for (c of cases(); track c.case_id) {
    <app-case-card [caseData]="c" />
  }
} @else {
  <p>No cases found.</p>
}
<!-- ❌ never: *ngIf, *ngFor, *ngSwitch -->
```

Forms — Signal Forms only:
```typescript
import { form, field } from '@angular/forms';
caseForm = form({
  description: field('', { validators: [Validators.required] }),
  severity: field<'low'|'medium'|'high'|'critical'>('medium'),
});
// ❌ never: new FormGroup(), new FormControl()
```

Dependency injection:
```typescript
// ✅ always inject()
private http = inject(HttpClient);
private router = inject(Router);
// ❌ never: constructor(private http: HttpClient)
```

---

## Type Imports

All shared types live in `packages/backend/src/types/index.ts`.
Never re-declare these inline — always import:

```typescript
import type {
  CaseContext, AgentFinding, CaseOutcome,
  RagChunk, ToolResult, SupportCase,
  AgentEvent, IssueCategory, CaseVerdict, AgentType,
} from '../types/index.js';
```

---

## File Naming

```
backend agents:   billing-plan.agent.ts
backend tools:    service-status.tool.ts, escalation.tool.ts
backend API:      cases.router.ts
Angular:          case-submit.component.ts/html/scss/spec.ts
```

---

## What Copilot Should Never Suggest

- `require()` or CommonJS patterns
- `ts-node` in scripts or package.json
- `console.log/warn/error` in any backend file
- `new Error('message')` — use typed error classes
- Template literals in SQL queries
- `*ngIf` / `*ngFor` directives
- Constructor injection in Angular components
- `new FormGroup()` / `new FormControl()`
- `BehaviorSubject` for component-local state
- `any` type annotations
- `import fs from 'fs'` without `node:` prefix
- Auto-increment integers as primary keys
