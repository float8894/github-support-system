# Phase 2 Implementation Guide

## 🎯 Objective

Ingest 22 GitHub documentation URLs into the `document_chunks` table using pgvector for semantic search.

## 📋 Prerequisites

✅ Phase 1 completed:
- Database schema created
- `document_chunks` table exists with vector(1536) column
- OpenAI API key configured in `.env`

## 🔨 Files to Create

### 1. `packages/backend/src/rag/ingest.ts`

**Responsibilities:**
- Fetch all 22 GitHub Docs URLs
- Convert HTML to Markdown using `turndown`
- Chunk documents (~500 tokens, 50-token overlap)
- Generate embeddings using OpenAI `text-embedding-3-small`
- Upsert into `document_chunks` table

**Key implementation points:**
```typescript
import fetch from 'node-fetch';
import Turndown from 'turndown';
import OpenAI from 'openai';
import { randomUUID } from 'node:crypto';
import { query } from '../lib/database.js';

const openai = new OpenAI({ apiKey: env.OPENAI_API_KEY });

// Chunking strategy:
// - Target: 500 tokens per chunk
// - Overlap: 50 tokens
// - Preserve section boundaries
// - Keep section_heading for context

// Upsert pattern:
// INSERT INTO document_chunks (chunk_id, source_url, section_heading, chunk_text, embedding)
// VALUES ($1, $2, $3, $4, $5)
// ON CONFLICT (chunk_id) DO UPDATE
// SET embedding = EXCLUDED.embedding, chunk_text = EXCLUDED.chunk_text
```

**URLs to ingest (22 total):**

1. https://docs.github.com/en/get-started/learning-about-github/githubs-plans
2. https://docs.github.com/en/billing/managing-your-plan-and-licenses/about-per-user-pricing
3. https://docs.github.com/en/billing/managing-your-plan-and-licenses/upgrading-your-accounts-plan
4. https://docs.github.com/en/billing/managing-your-plan-and-licenses/downgrading-your-accounts-plan
5. https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/managing-your-personal-access-tokens
6. https://docs.github.com/en/authentication/authenticating-with-saml-single-sign-on/about-authentication-with-saml-single-sign-on
7. https://docs.github.com/en/enterprise-cloud@latest/admin/managing-iam/understanding-iam-for-enterprises/about-saml-for-enterprise-iam
8. https://docs.github.com/en/enterprise-cloud@latest/admin/managing-iam/configuring-authentication-for-enterprise-managed-users/configuring-saml-single-sign-on-for-enterprise-managed-users
9. https://docs.github.com/en/enterprise-cloud@latest/admin/managing-iam/understanding-iam-for-enterprises/troubleshooting-authentication-for-your-enterprise
10. https://docs.github.com/en/rest/using-the-rest-api/rate-limits-for-the-rest-api
11. https://docs.github.com/en/rest/using-the-rest-api/troubleshooting-the-rest-api
12. https://docs.github.com/en/graphql/overview/resource-limitations
13. https://docs.github.com/en/actions/administering-github-actions/usage-limits-billing-and-administration
14. https://docs.github.com/en/code-security/getting-started/github-security-features
15. https://docs.github.com/en/organizations/managing-organization-settings/managing-security-and-analysis-settings-for-your-organization
16. https://docs.github.com/en/enterprise-cloud@latest/admin/enforcing-policies/enforcing-policies-for-your-enterprise/about-enterprise-policies
17. https://docs.github.com/en/enterprise-cloud@latest/billing/managing-the-plan-for-your-github-account/about-billing-for-your-enterprise
18. https://docs.github.com/en/support/learning-about-github-support/about-github-support
19. https://docs.github.com/en/get-started/using-github/troubleshooting-connectivity-problems
20. https://docs.github.com/en/authentication/troubleshooting-ssh/error-permission-denied-publickey
21. https://docs.github.com/en/apps/creating-github-apps/authenticating-with-a-github-app/about-authentication-with-a-github-app
22. https://docs.github.com/en/rest/overview/resources-in-the-rest-api

### 2. `packages/backend/src/rag/retrieve.ts`

**Responsibilities:**
- Accept a query string
- Generate embedding for the query
- Perform cosine similarity search in pgvector
- Return top-N scored chunks

**Key implementation:**
```typescript
import OpenAI from 'openai';
import { query } from '../lib/database.js';
import type { RagChunk } from '../types/index.js';
import { RagError } from '../errors/index.js';

export async function retrieveChunks(
  queryText: string,
  limit = 5
): Promise<RagChunk[]> {
  try {
    // 1. Generate embedding for query
    const openai = new OpenAI({ apiKey: env.OPENAI_API_KEY });
    const embeddingResponse = await openai.embeddings.create({
      model: 'text-embedding-3-small',
      input: queryText,
    });
    const embedding = embeddingResponse.data[0].embedding;

    // 2. Perform vector similarity search
    // CRITICAL: Use <=> operator for cosine distance
    // Score = 1 - distance (higher is better)
    const rows = await query<RagChunk>(
      `SELECT 
         chunk_id,
         source_url,
         section_heading,
         chunk_text,
         1 - (embedding <=> $1::vector) AS score
       FROM document_chunks
       ORDER BY embedding <=> $1::vector
       LIMIT $2`,
      [JSON.stringify(embedding), limit]
    );

    return rows;
  } catch (err) {
    throw new RagError('Failed to retrieve chunks', err);
  }
}
```

## ✅ Acceptance Criteria

### 1. Ingestion Success
```bash
tsx packages/backend/src/rag/ingest.ts
```

**Expected output:**
- ✅ All 22 URLs fetched successfully
- ✅ HTML converted to Markdown
- ✅ Documents chunked (should be ~200-500 chunks total)
- ✅ Embeddings generated for all chunks
- ✅ All chunks inserted into database
- ✅ No errors logged

**Verification query:**
```sql
SELECT 
  source_url,
  COUNT(*) as chunk_count
FROM document_chunks
GROUP BY source_url
ORDER BY chunk_count DESC;
```

Should show 22 URLs with varying chunk counts.

### 2. Retrieval Success

**Test 1: Token-related query**
```typescript
const chunks = await retrieveChunks('personal access token expired');
console.log(chunks.length); // Should be 5
console.log(chunks[0].score); // Should be > 0.7
console.log(chunks[0].source_url); // Should be PAT-related URL
```

**Test 2: Billing-related query**
```typescript
const chunks = await retrieveChunks('downgrade plan cancel subscription');
console.log(chunks[0].source_url); // Should be billing-related
```

**Test 3: SAML-related query**
```typescript
const chunks = await retrieveChunks('SAML SSO authentication failure');
console.log(chunks[0].source_url); // Should be SAML-related
```

## 🔧 Implementation Tips

### Chunking Strategy

**Simple sentence-based chunking:**
```typescript
function chunkText(text: string, chunkSize = 500, overlap = 50): string[] {
  const sentences = text.split(/[.!?]+/).filter(s => s.trim());
  const chunks: string[] = [];
  let currentChunk: string[] = [];
  let tokenCount = 0;

  for (const sentence of sentences) {
    const sentenceTokens = estimateTokens(sentence);
    
    if (tokenCount + sentenceTokens > chunkSize && currentChunk.length > 0) {
      chunks.push(currentChunk.join('. ') + '.');
      // Keep last few sentences for overlap
      currentChunk = currentChunk.slice(-Math.ceil(overlap / 100));
      tokenCount = currentChunk.reduce((sum, s) => sum + estimateTokens(s), 0);
    }
    
    currentChunk.push(sentence.trim());
    tokenCount += sentenceTokens;
  }
  
  if (currentChunk.length > 0) {
    chunks.push(currentChunk.join('. ') + '.');
  }
  
  return chunks;
}

function estimateTokens(text: string): number {
  // Rough estimate: ~4 chars per token
  return Math.ceil(text.length / 4);
}
```

### Error Handling

```typescript
// Retry failed URLs
const MAX_RETRIES = 3;
for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
  try {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    break;
  } catch (err) {
    if (attempt === MAX_RETRIES) {
      logger.error({ url, err }, 'Failed to fetch after retries');
      continue; // Skip this URL
    }
    await sleep(1000 * attempt); // Exponential backoff
  }
}
```

### Rate Limiting OpenAI

```typescript
// Batch embeddings when possible
const BATCH_SIZE = 100;
for (let i = 0; i < allChunks.length; i += BATCH_SIZE) {
  const batch = allChunks.slice(i, i + BATCH_SIZE);
  const response = await openai.embeddings.create({
    model: 'text-embedding-3-small',
    input: batch.map(c => c.chunk_text),
  });
  // Process response.data array
  await sleep(100); // Rate limit buffer
}
```

## 🧪 Testing

Create `packages/backend/src/rag/retrieve.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { retrieveChunks } from './retrieve.js';

describe('retrieveChunks', () => {
  it('should return chunks for token query', async () => {
    const chunks = await retrieveChunks('personal access token');
    expect(chunks).toHaveLength(5);
    expect(chunks[0].score).toBeGreaterThan(0.5);
  });

  it('should return chunks for billing query', async () => {
    const chunks = await retrieveChunks('upgrade plan pricing');
    expect(chunks).toHaveLength(5);
    expect(chunks[0].source_url).toContain('billing');
  });
});
```

## 📊 Expected Results

**Database state after Phase 2:**
```
document_chunks table:
  • ~300-500 total chunks
  • 22 unique source_url values
  • All embedding vectors are 1536 dimensions
  • Cosine similarity index created
```

**Performance expectations:**
- Ingestion: ~2-5 minutes for all 22 URLs
- Retrieval: <100ms per query
- Embedding generation: ~50ms per query

## 🚀 Running Phase 2

```bash
# Terminal 1: Ensure database is running
npm run docker:up

# Terminal 2: Run ingestion
tsx packages/backend/src/rag/ingest.ts

# Terminal 3: Test retrieval
tsx packages/backend/src/rag/retrieve.test.ts
```

## ✅ Phase 2 Complete When...

- [x] All 22 URLs ingested
- [x] `document_chunks` populated
- [x] `retrieveChunks()` returns relevant results
- [x] Cosine similarity scores > 0.7 for relevant queries
- [x] No errors in production logs
- [x] Tests pass

**Ready for Phase 3: MCP Server** 🚀

---

## 📚 Reference Documentation

- **pgvector documentation:** https://github.com/pgvector/pgvector
- **OpenAI Embeddings API:** https://platform.openai.com/docs/guides/embeddings
- **Turndown (HTML to MD):** https://github.com/mixmark-io/turndown
- **Node 24 skill:** `/mnt/skills/user/node24/SKILL.md`

## 💡 Pro Tips

1. **Test with one URL first** - Get the pipeline working with a single URL before processing all 22
2. **Log everything** - Use Pino to log each step (fetch, convert, chunk, embed, insert)
3. **Handle duplicates** - Use `ON CONFLICT` in SQL to allow re-running ingestion
4. **Monitor token usage** - OpenAI charges per token for embeddings
5. **Cache embeddings** - Consider Redis cache for frequently queried embeddings
