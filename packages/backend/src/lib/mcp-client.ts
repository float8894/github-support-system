import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { env } from '../config/env.js';
import { McpToolError } from '../errors/index.js';
import { logger } from './logger.js';

const log = logger.child({ service: 'mcp-client' });

class McpClient {
  private client: Client | null = null;
  private connectPromise: Promise<void> | null = null;

  private async connect(): Promise<void> {
    if (this.client !== null) return;
    if (this.connectPromise !== null) {
      await this.connectPromise;
      return;
    }

    this.connectPromise = (async () => {
      log.info({ path: env.MCP_SERVER_PATH }, 'Connecting to MCP server');

      const transport = new StdioClientTransport({
        command: 'node',
        args: [env.MCP_SERVER_PATH],
        env: {
          DATABASE_URL: env.DATABASE_URL,
          REDIS_URL: env.REDIS_URL,
          NODE_ENV: env.NODE_ENV,
          LOG_LEVEL: env.LOG_LEVEL,
        },
      });

      const client = new Client(
        { name: 'github-support-backend', version: '1.0.0' },
        { capabilities: {} },
      );

      await client.connect(transport);
      this.client = client;
      log.info('MCP server connected');
    })();

    await this.connectPromise;
  }

  async callTool(
    toolName: string,
    args: Record<string, unknown>,
  ): Promise<unknown> {
    try {
      await this.connect();

      const result = await this.client!.callTool({
        name: toolName,
        arguments: args,
      });

      const content = result.content;
      if (!Array.isArray(content) || content.length === 0) {
        throw new McpToolError(
          `Tool ${toolName} returned empty content`,
          toolName,
        );
      }

      const first = content[0];
      if (typeof first !== 'object' || first === null || !('text' in first)) {
        throw new McpToolError(
          `Tool ${toolName} returned non-text content`,
          toolName,
        );
      }

      const text = (first as { text: string }).text;
      const parsed: unknown = JSON.parse(text);

      log.debug({ tool: toolName }, 'MCP tool call succeeded');
      return parsed;
    } catch (err) {
      if (err instanceof McpToolError) throw err;
      throw new McpToolError(`MCP tool ${toolName} failed`, toolName, err);
    }
  }

  async close(): Promise<void> {
    if (this.client) {
      await this.client.close();
      this.client = null;
      this.connectPromise = null;
      log.info('MCP client closed');
    }
  }
}

export const mcpClient = new McpClient();
