/**
 * PostgreSQL connection pool for the MCP server.
 * Standalone copy — reads DATABASE_URL directly from process.env.
 * Fails fast if the variable is missing.
 */
import pg from 'pg';
import { logger } from './logger.js';

const { Pool } = pg;

const dbUrl = process.env['DATABASE_URL'];
if (!dbUrl) {
  logger.error(
    'DATABASE_URL environment variable is not set — cannot start MCP server',
  );
  process.exit(1);
}

export const pool = new Pool({ connectionString: dbUrl });

pool.on('error', (err: Error) => {
  logger.error({ err }, 'Unexpected database pool error');
  process.exit(1);
});
