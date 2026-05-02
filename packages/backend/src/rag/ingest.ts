import fetch from 'node-fetch';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import OpenAI from 'openai';
import TurndownService from 'turndown';
import { env } from '../config/env.js';
import { DatabaseError, RagError } from '../errors/index.js';
import { pool } from '../lib/database.js';
import { logger } from '../lib/logger.js';

const log = logger.child({ service: 'rag', fn: 'ingest' });

const openai = new OpenAI({ apiKey: env.OPENAI_API_KEY });

const turndown = new TurndownService({
  headingStyle: 'atx',
  codeBlockStyle: 'fenced',
});

// ─── Source URLs (loaded from sources.txt) ───────────────────────────────────

const __dirname = dirname(fileURLToPath(import.meta.url));
const SOURCE_URLS: string[] = readFileSync(
  join(__dirname, 'sources.txt'),
  'utf8',
)
  .split('\n')
  .map((line) => line.trim())
  .filter((line) => line.length > 0 && !line.startsWith('#'));

// ─── Fetch with retry ─────────────────────────────────────────────────────────

async function fetchWithRetry(url: string, attempt = 1): Promise<string> {
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'github-support-rag-ingest/1.0' },
    });
    if (!res.ok) {
      throw new RagError(`HTTP ${res.status} fetching ${url}`);
    }
    return await res.text();
  } catch (err) {
    if (attempt >= 3) {
      throw new RagError(`Failed to fetch ${url} after 3 attempts`, err);
    }
    const delayMs = attempt * 1000;
    log.warn({ url, attempt, delayMs }, 'Fetch failed, retrying');
    await new Promise((resolve) => setTimeout(resolve, delayMs));
    return fetchWithRetry(url, attempt + 1);
  }
}

// ─── HTML extraction ──────────────────────────────────────────────────────────

function extractArticleHtml(html: string): string {
  // Try <article> first, then <main>, then full <body>
  const articleMatch = /<article[^>]*>([\s\S]*?)<\/article>/i.exec(html);
  if (articleMatch?.[1]) return articleMatch[1];

  const mainMatch = /<main[^>]*>([\s\S]*?)<\/main>/i.exec(html);
  if (mainMatch?.[1]) return mainMatch[1];

  const bodyMatch = /<body[^>]*>([\s\S]*?)<\/body>/i.exec(html);
  if (bodyMatch?.[1]) return bodyMatch[1];

  return html;
}

// ─── HTML → Markdown ─────────────────────────────────────────────────────────

function htmlToMarkdown(html: string): string {
  return turndown.turndown(html);
}

// ─── Deterministic chunk ID ───────────────────────────────────────────────────
// Deliberate exception to the randomUUID() rule — stable IDs are required for
// idempotent upserts. Using random IDs would create duplicates on every re-run.

function deterministicChunkId(
  sourceUrl: string,
  heading: string,
  index: number,
): string {
  const hash = createHash('sha256')
    .update(`${sourceUrl}::${heading}::${index}`)
    .digest('hex');
  // Format as UUID v4 shape (8-4-4-4-12)
  return [
    hash.slice(0, 8),
    hash.slice(8, 12),
    hash.slice(12, 16),
    hash.slice(16, 20),
    hash.slice(20, 32),
  ].join('-');
}

// ─── Chunking ─────────────────────────────────────────────────────────────────

interface RawChunk {
  chunk_id: string;
  source_url: string;
  section_heading: string;
  chunk_text: string;
}

const CHUNK_SIZE = 2000; // ~500 tokens (1 token ≈ 4 chars)
const CHUNK_OVERLAP = 200; // ~50 tokens

function splitIntoChunks(markdown: string, sourceUrl: string): RawChunk[] {
  const chunks: RawChunk[] = [];

  // Split markdown into sections by heading lines
  const headingRegex = /^#{1,6} .+/m;
  const lines = markdown.split('\n');

  const sections: Array<{ heading: string; body: string }> = [];
  let currentHeading = 'Introduction';
  let currentLines: string[] = [];

  for (const line of lines) {
    if (headingRegex.test(line)) {
      if (currentLines.length > 0) {
        sections.push({
          heading: currentHeading,
          body: currentLines.join('\n').trim(),
        });
      }
      currentHeading = line.replace(/^#+\s*/, '').trim();
      currentLines = [line];
    } else {
      currentLines.push(line);
    }
  }
  if (currentLines.length > 0) {
    sections.push({
      heading: currentHeading,
      body: currentLines.join('\n').trim(),
    });
  }

  let globalIndex = 0;

  for (const section of sections) {
    const text = section.body;
    if (text.length === 0) continue;

    if (text.length <= CHUNK_SIZE) {
      chunks.push({
        chunk_id: deterministicChunkId(sourceUrl, section.heading, globalIndex),
        source_url: sourceUrl,
        section_heading: section.heading,
        chunk_text: text,
      });
      globalIndex++;
    } else {
      // Sub-chunk large sections with overlap
      let start = 0;
      while (start < text.length) {
        const end = Math.min(start + CHUNK_SIZE, text.length);
        const chunkText = text.slice(start, end).trim();
        if (chunkText.length > 0) {
          chunks.push({
            chunk_id: deterministicChunkId(
              sourceUrl,
              section.heading,
              globalIndex,
            ),
            source_url: sourceUrl,
            section_heading: section.heading,
            chunk_text: chunkText,
          });
          globalIndex++;
        }
        if (end === text.length) break;
        start = end - CHUNK_OVERLAP;
      }
    }
  }

  return chunks;
}

// ─── Batch embedding ──────────────────────────────────────────────────────────

async function embedBatch(texts: string[]): Promise<number[][]> {
  const BATCH_SIZE = 100;
  const allEmbeddings: number[][] = [];

  for (let i = 0; i < texts.length; i += BATCH_SIZE) {
    const batch = texts.slice(i, i + BATCH_SIZE);
    try {
      const res = await openai.embeddings.create({
        model: 'text-embedding-3-small',
        input: batch,
      });
      const batchEmbeddings = res.data.map((d) => d.embedding);
      allEmbeddings.push(...batchEmbeddings);
    } catch (err) {
      throw new RagError(`Embedding batch ${i / BATCH_SIZE + 1} failed`, err);
    }

    // 100ms sleep between batches to respect rate limits
    if (i + BATCH_SIZE < texts.length) {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }

  return allEmbeddings;
}

// ─── Upsert chunks ────────────────────────────────────────────────────────────

interface ChunkWithEmbedding extends RawChunk {
  embedding: number[];
}

async function upsertChunks(chunks: ChunkWithEmbedding[]): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    for (const chunk of chunks) {
      const vectorLiteral = `[${chunk.embedding.join(',')}]`;
      await client.query(
        `INSERT INTO document_chunks
           (chunk_id, source_url, section_heading, chunk_text, embedding)
         VALUES ($1, $2, $3, $4, $5::vector)
         ON CONFLICT (chunk_id) DO UPDATE
           SET chunk_text = EXCLUDED.chunk_text,
               embedding  = EXCLUDED.embedding`,
        [
          chunk.chunk_id,
          chunk.source_url,
          chunk.section_heading,
          chunk.chunk_text,
          vectorLiteral,
        ],
      );
    }
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw new DatabaseError('Failed to upsert document chunks', err);
  } finally {
    client.release();
  }
}

// ─── Ingest a single URL ──────────────────────────────────────────────────────

async function ingestUrl(url: string): Promise<number> {
  log.info({ url }, 'Fetching');
  const html = await fetchWithRetry(url);
  const articleHtml = extractArticleHtml(html);
  const markdown = htmlToMarkdown(articleHtml);
  const chunks = splitIntoChunks(markdown, url);

  if (chunks.length === 0) {
    log.warn({ url }, 'No chunks extracted — skipping');
    return 0;
  }

  log.info({ url, chunkCount: chunks.length }, 'Embedding chunks');
  const texts = chunks.map((c) => `${c.section_heading}\n\n${c.chunk_text}`);
  const embeddings = await embedBatch(texts);

  const chunksWithEmbeddings: ChunkWithEmbedding[] = chunks.map((c, i) => ({
    ...c,
    embedding: embeddings[i] ?? [],
  }));

  await upsertChunks(chunksWithEmbeddings);
  log.info({ url, chunkCount: chunks.length }, 'Ingested');
  return chunks.length;
}

// ─── ingestAll — callable from API ───────────────────────────────────────────

export async function ingestAll(): Promise<{
  totalChunks: number;
  failedUrls: number;
}> {
  log.info({ urlCount: SOURCE_URLS.length }, 'Starting RAG ingestion');
  let totalChunks = 0;
  let failedUrls = 0;

  for (const url of SOURCE_URLS) {
    try {
      const count = await ingestUrl(url);
      totalChunks += count;
    } catch (err) {
      log.error({ err, url }, 'Failed to ingest URL — continuing');
      failedUrls++;
    }
  }

  log.info(
    { totalChunks, failedUrls, totalUrls: SOURCE_URLS.length },
    'Ingestion complete',
  );
  return { totalChunks, failedUrls };
}

// ─── CLI entry point ──────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const result = await ingestAll();
  log.info(result, 'Ingestion pipeline finished');
  await pool.end();
}

main().catch((err: unknown) => {
  log.error({ err }, 'Ingestion pipeline crashed');
  process.exit(1);
});
