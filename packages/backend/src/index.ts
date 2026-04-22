import { closePool } from './lib/database.js';
import { logger } from './lib/logger.js';
import { closeRedis } from './lib/redis.js';

/**
 * Main entry point for the GitHub Support System backend.
 * This file will be expanded in Phase 5 to start the Express server.
 *
 * Phase 1: Just validates that all core modules load correctly.
 */

async function main() {
  logger.info('GitHub Support System Backend starting...');
  logger.info('Phase 1: Foundation - Core modules loaded successfully');

  // Test database connection
  try {
    const { query } = await import('./lib/database.js');
    await query('SELECT 1 as health_check');
    logger.info('Database connection: OK');
  } catch (err) {
    logger.error({ err }, 'Database connection: FAILED');
    throw err;
  }

  // Test Redis connection
  try {
    const { redis } = await import('./lib/redis.js');
    await redis.ping();
    logger.info('Redis connection: OK');
  } catch (err) {
    logger.error({ err }, 'Redis connection: FAILED');
    throw err;
  }

  logger.info('All systems operational');
  logger.info('Waiting for shutdown signal...');
}

/**
 * Graceful shutdown handler.
 * Closes all connections cleanly.
 */
async function shutdown(signal: string) {
  logger.info({ signal }, 'Shutdown signal received');

  try {
    await closePool();
    await closeRedis();
    logger.info('Graceful shutdown complete');
    process.exit(0);
  } catch (err) {
    logger.error({ err }, 'Error during shutdown');
    process.exit(1);
  }
}

// Register shutdown handlers (guard against double-invocation in --watch mode)
let shuttingDown = false;
const handleShutdown = (signal: string) => {
  if (shuttingDown) return;
  shuttingDown = true;
  void shutdown(signal);
};
process.on('SIGTERM', () => handleShutdown('SIGTERM'));
process.on('SIGINT', () => handleShutdown('SIGINT'));

// Handle unhandled rejections
process.on('unhandledRejection', (err) => {
  logger.error({ err }, 'Unhandled promise rejection');
  process.exit(1);
});

// Start the application
main().catch((err) => {
  logger.error({ err }, 'Fatal error during startup');
  process.exit(1);
});
