# Node 24 TypeScript Skill

## Runtime & Module System

This project runs on **Node 24** with **ESM only**. Every `package.json` contains `"type": "module"`.

### Imports

```typescript
// ✅ ESM — always
import { randomUUID } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { createServer } from 'node:http';

// ❌ Never
const fs = require('fs');
import fs from 'fs'; // missing node: prefix
import { readFile } from 'fs/promises'; // missing node: prefix
```

### TypeScript config

- `"module": "NodeNext"`, `"moduleResolution": "NodeNext"`, `"strict": true`
- All local imports must have `.js` extension (even for `.ts` source files):

```typescript
import { logger } from '../lib/logger.js'; // ✅
import { logger } from '../lib/logger'; // ❌ will fail at runtime
```

### Dev vs Build

| Task       | Command          | Tool |
| ---------- | ---------------- | ---- |
| Dev server | `tsx watch src/` | tsx  |
| Production | `tsc`            | tsc  |

Never use `ts-node`, `nodemon`, or `babel` in this project.

---

## Logging

**Always** use `pino`. Never use `console.log/warn/error` in backend files.

```typescript
import { logger } from '../lib/logger.js';

// Create a child logger scoped to the current module
const log = logger.child({ service: 'my-service' });

log.info({ org_id, case_id }, 'Processing started');
log.warn({ threshold }, 'Rate limit approaching');
log.error({ err }, 'Unexpected failure');

// ❌ Never
console.log('processing started');
console.error(err);
```

---

## IDs

All IDs are UUIDs from `node:crypto`. Never use integers, `Math.random()`, or `nanoid`.

```typescript
import { randomUUID } from 'node:crypto';

const caseId = randomUUID(); // ✅ — crypto-secure UUID v4
```

---

## Types

- **Never use `any`**. Use `unknown` with a type guard:

```typescript
// ✅ correct
function isError(val: unknown): val is Error {
  return val instanceof Error;
}

// ❌ never
function process(data: any) { ... }
```

---

## Error Handling

Always throw typed subclasses from `src/errors/index.ts`:

```typescript
import {
  DatabaseError,
  McpToolError,
  AgentError,
  RagError,
  ValidationError,
} from '../errors/index.js';

// ❌ Never
throw new Error('something went wrong');
throw 'string error';

// ✅ Always
throw new DatabaseError('Failed to fetch case', originalErr);
throw new AgentError('Agent timed out', 'BillingPlanAgent', originalErr);
```

---

## Environment Variables

All env vars validated with Zod at startup. Never access `process.env` directly outside `src/config/env.ts`.

```typescript
// src/config/env.ts
import { z } from 'zod';

const envSchema = z.object({
  DATABASE_URL: z.string().url(),
  REDIS_URL: z.string().url(),
  ANTHROPIC_API_KEY: z.string().min(1),
  OPENAI_API_KEY: z.string().min(1),
  PORT: z.coerce.number().default(3000),
  NODE_ENV: z
    .enum(['development', 'production', 'test'])
    .default('development'),
  MCP_SERVER_PATH: z.string().min(1),
});

export const env = envSchema.parse(process.env);
```

---

## Package Scripts

```json
{
  "scripts": {
    "dev": "tsx watch src/index.ts",
    "build": "tsc",
    "test": "vitest",
    "typecheck": "tsc --noEmit"
  }
}
```
