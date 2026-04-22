# RAG Skill

## Overview

Two-phase pipeline:

1. **Ingest** (`rag/ingest.ts`) — fetch docs → chunk → embed → store in `document_chunks`
2. **Retrieve** (`rag/retrieve.ts`) — embed query → cosine similarity search → return top-k chunks

---

## Vector Retrieval SQL — Never Modify

```typescript
// packages/backend/src/rag/retrieve.ts
import type { RagChunk } from '../types/index.js';
import { pool } from '../lib/database.js';
import { RagError } from '../errors/index.js';

export async function ragRetrieve(
  queryEmbedding: number[],
  limit = 5,
): Promise<RagChunk[]> {
  try {
    const { rows } = await pool.query<RagChunk>(
      `SELECT chunk_id, source_url, section_heading, chunk_text,
         1 - (embedding <=> $1::vector) AS score
       FROM document_chunks
       ORDER BY embedding <=> $1::vector
       LIMIT $2`,
      [queryEmbedding, limit],
    );
    return rows;
  } catch (err) {
    throw new RagError('Vector search failed', err);
  }
}
```

**The SQL above is canonical.** Do not add `WHERE score > threshold` or change `ORDER BY`.

---

## Embedding — OpenAI text-embedding-3-small

```typescript
import OpenAI from 'openai';
import { env } from '../config/env.js';
import { RagError } from '../errors/index.js';

const openai = new OpenAI({ apiKey: env.OPENAI_API_KEY });

export async function embed(text: string): Promise<number[]> {
  try {
    const res = await openai.embeddings.create({
      model: 'text-embedding-3-small',
      input: text,
    });
    return res.data[0].embedding;
  } catch (err) {
    throw new RagError('Embedding failed', err);
  }
}
```

---

## Ingest Pipeline (`rag/ingest.ts`)

```typescript
// High-level flow — implement each step fully
const docs = await fetchDocs(SOURCE_URLS); // fetch + turndown to markdown
const chunks = chunkDocs(docs, 512, 50); // 512 tokens, 50-token overlap
const embeddings = await embedBatch(chunks); // batch embed with rate limiting
await storeChunks(chunks, embeddings); // upsert into document_chunks
```

### Chunking rules

- Target: ~512 tokens per chunk
- Overlap: ~50 tokens
- Split on: paragraph breaks first, then sentence boundaries
- Preserve `source_url` and `section_heading` metadata per chunk

### Storage

```typescript
// Upsert — safe to re-run
await pool.query(
  `INSERT INTO document_chunks
     (chunk_id, source_url, section_heading, chunk_text, embedding)
   VALUES ($1, $2, $3, $4, $5::vector)
   ON CONFLICT (chunk_id) DO UPDATE
     SET chunk_text = EXCLUDED.chunk_text,
         embedding  = EXCLUDED.embedding`,
  [chunkId, sourceUrl, sectionHeading, chunkText, embedding],
);
```

---

## RagChunk Type

```typescript
// From packages/backend/src/types/index.ts — never re-declare
interface RagChunk {
  chunk_id: string;
  source_url: string;
  section_heading: string;
  chunk_text: string;
  score: number; // cosine similarity 0.0–1.0
}
```

---

## How Agents Use RAG

```typescript
// Inside any agent's run() method:
const query = `${context.caseInput.subject} ${context.caseInput.description}`;
const queryEmbedding = await embed(query);
const chunks = await ragRetrieve(queryEmbedding, 5);

// Pass chunks to Claude in the user message:
const docContext = chunks
  .map((c) => `[${c.chunk_id}] ${c.section_heading}\n${c.chunk_text}`)
  .join('\n\n');
```

---

## Source URLs to Ingest

```typescript
const SOURCE_URLS = [
  'https://docs.github.com/en/billing',
  'https://docs.github.com/en/authentication/keeping-your-account-and-data-secure',
  'https://docs.github.com/en/rest/overview/rate-limits-for-the-rest-api',
  'https://docs.github.com/en/enterprise-cloud@latest/admin/identity-and-access-management',
  'https://docs.github.com/en/code-security/getting-started/github-security-features',
];
```

---

## Error Class

```typescript
throw new RagError('Descriptive message about what failed', originalErr);
```
