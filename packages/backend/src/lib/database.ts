import pg from 'pg';
import { env } from '../config/env.js';
import { logger } from './logger.js';
import { DatabaseError } from '../errors/index.js';

const { Pool } = pg;

/**
 * Global PostgreSQL connection pool.
 * Configured with pgvector extension support.
 */
export const pool = new Pool({
  connectionString: env.DATABASE_URL,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});

// Log pool errors
pool.on('error', (err) => {
  logger.error({ err }, 'Unexpected PostgreSQL pool error');
});

/**
 * Execute a parameterized SQL query.
 * Always use this instead of raw pool.query to ensure error wrapping.
 *
 * @example
 * const rows = await query('SELECT * FROM users WHERE id = $1', [userId]);
 */
export async function query<T = unknown>(
  sql: string,
  params?: unknown[],
): Promise<T[]> {
  try {
    const result = await pool.query(sql, params);
    return result.rows as T[];
  } catch (err) {
    throw new DatabaseError('Database query failed', err);
  }
}

/**
 * Execute a query and return a single row or null.
 */
export async function queryOne<T = unknown>(
  sql: string,
  params?: unknown[],
): Promise<T | null> {
  const rows = await query<T>(sql, params);
  return rows[0] ?? null;
}

/**
 * Gracefully close the pool on shutdown.
 * Call this in the shutdown handler.
 */
export async function closePool(): Promise<void> {
  await pool.end();
  logger.info('PostgreSQL pool closed');
}
