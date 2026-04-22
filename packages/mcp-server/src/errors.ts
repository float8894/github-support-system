/**
 * Error classes for the MCP server.
 * Standalone copy — this package cannot import from packages/backend.
 */

export class McpToolError extends Error {
  readonly toolName: string;

  constructor(message: string, toolName: string, cause?: unknown) {
    if (cause !== undefined) {
      super(message, { cause });
    } else {
      super(message);
    }
    this.name = 'McpToolError';
    this.toolName = toolName;
  }
}
