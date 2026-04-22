/**
 * Pino logger for the MCP server.
 * Writes to stderr (fd 2) to avoid interfering with StdioServerTransport on stdout.
 */
import pino from 'pino';

const level = process.env['LOG_LEVEL'] ?? 'info';

// Write to stderr in both modes so MCP stdio protocol on stdout is unaffected.
export const logger =
  process.env['NODE_ENV'] !== 'production'
    ? pino({
        level,
        transport: {
          target: 'pino-pretty',
          options: {
            colorize: true,
            translateTime: 'HH:MM:ss.l',
            destination: 2,
          },
        },
      })
    : pino({ level }, pino.destination(2));
