import pino from 'pino';
import { env } from '../config/env.js';

/**
 * Global Pino logger instance.
 * Configured with pretty printing in development, JSON in production.
 */
export const logger = pino({
  level: env.LOG_LEVEL,
  ...(env.NODE_ENV !== 'production'
    ? {
        transport: {
          target: 'pino-pretty',
          options: {
            colorize: true,
            translateTime: 'HH:MM:ss.l',
            ignore: 'pid,hostname',
          },
        },
      }
    : {}),
});

/**
 * Create a child logger with additional context.
 * Use this to add service/agent/tool name to every log line.
 *
 * @example
 * const log = createLogger({ service: 'mcp-server', tool: 'get_org_context' });
 * log.info({ org_id }, 'Tool invoked');
 */
export const createLogger = (context: Record<string, unknown>) =>
  logger.child(context);
