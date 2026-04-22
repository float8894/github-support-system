import OpenAI from 'openai';
import { env } from '../config/env.js';
import { RagError } from '../errors/index.js';
import { pool } from '../lib/database.js';
import { logger } from '../lib/logger.js';
import type { RagChunk } from '../types/index.js';

const log = logger.child({ service: 'rag', fn: 'retrieve' });

const openai = new OpenAI({ apiKey: env.OPENAI_API_KEY });

export async function embedQuery(text: string): Promise<number[]> {
  try {
    const res = await openai.embeddings.create({
      model: 'text-embedding-3-small',
      input: text,
    });
    const embedding = res.data[0]?.embedding;
    if (!embedding) {
      throw new RagError('OpenAI returned no embedding data');
    }
    return embedding;
  } catch (err) {
    if (err instanceof RagError) throw err;
    throw new RagError('Embedding query failed', err);
  }
}

export async function retrieveChunks(
  query: string,
  limit = 5,
): Promise<RagChunk[]> {
  log.debug({ query, limit }, 'Retrieving chunks');

  const embedding = await embedQuery(query);
  // Format as Postgres vector literal: [x,y,z,...]
  const vectorLiteral = `[${embedding.join(',')}]`;

  const client = await pool.connect();
  try {
    // Wrap SET LOCAL + SELECT in one transaction so the probes setting
    // applies to the vector search. SET LOCAL is a no-op outside a txn block.
    // Increase probes so small corpora (< 10k rows, lists=100) get full top-k
    // recall — default probes=1 only scans ~2 vectors with 262 total rows.
    await client.query('BEGIN');
    await client.query('SET LOCAL ivfflat.probes = 20');

    const result = await client.query<RagChunk>(
      `SELECT chunk_id, source_url, section_heading, chunk_text,
         1 - (embedding <=> $1::vector) AS score
       FROM document_chunks
       ORDER BY embedding <=> $1::vector
       LIMIT $2`,
      [vectorLiteral, limit],
    );

    await client.query('COMMIT');
    log.debug({ count: result.rows.length }, 'Chunks retrieved');
    return result.rows;
  } catch (err) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw new RagError('Vector search failed', err);
  } finally {
    client.release();
  }
}
