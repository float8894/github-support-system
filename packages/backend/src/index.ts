import { createApp } from './api/app.js';
import { env } from './config/env.js';
import { closePool } from './lib/database.js';
import { logger } from './lib/logger.js';
import { mcpClient } from './lib/mcp-client.js';
import { closeRedis } from './lib/redis.js';

async function main() {
  logger.info('GitHub Support System Backend starting...');

  const app = createApp();

  const server = app.listen(env.PORT, () => {
    logger.info({ port: env.PORT }, `Listening on :${env.PORT}`);
  });

  /**
   * Graceful shutdown handler.
   */
  let shuttingDown = false;
  const handleShutdown = (signal: string) => {
    if (shuttingDown) return;
    shuttingDown = true;
    logger.info({ signal }, 'Shutdown signal received');

    server.close(async () => {
      try {
        await mcpClient.close();
        await closePool();
        await closeRedis();
        logger.info('Graceful shutdown complete');
        process.exit(0);
      } catch (err) {
        logger.error({ err }, 'Error during shutdown');
        process.exit(1);
      }
    });
  };

  process.on('SIGTERM', () => handleShutdown('SIGTERM'));
  process.on('SIGINT', () => handleShutdown('SIGINT'));
}

// Handle unhandled rejections
process.on('unhandledRejection', (err) => {
  logger.error({ err }, 'Unhandled promise rejection');
  process.exit(1);
});

main().catch((err) => {
  logger.error({ err }, 'Fatal error during startup');
  process.exit(1);
});
