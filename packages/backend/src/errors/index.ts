/**
 * Base application error class.
 * All custom errors extend this class.
 */
export class AppError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly statusCode: number = 500,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = this.constructor.name;
    Error.captureStackTrace(this, this.constructor);
  }
}

/**
 * Database operation errors.
 * Thrown when PostgreSQL queries fail.
 */
export class DatabaseError extends AppError {
  constructor(message: string, cause?: unknown) {
    super(message, 'DATABASE_ERROR', 500, { cause });
  }
}

/**
 * MCP tool execution errors.
 * Thrown when MCP tool calls fail.
 */
export class McpToolError extends AppError {
  constructor(
    message: string,
    public readonly toolName: string,
    cause?: unknown,
  ) {
    super(message, 'MCP_TOOL_ERROR', 500, { cause });
  }
}

/**
 * Input validation errors.
 * Thrown when Zod validation fails.
 */
export class ValidationError extends AppError {
  constructor(message: string, cause?: unknown) {
    super(message, 'VALIDATION_ERROR', 400, { cause });
  }
}

/**
 * Agent execution errors.
 * Thrown when agent logic fails.
 */
export class AgentError extends AppError {
  constructor(
    message: string,
    public readonly agentName: string,
    cause?: unknown,
  ) {
    super(message, 'AGENT_ERROR', 500, { cause });
  }
}

/**
 * RAG retrieval errors.
 * Thrown when document retrieval or embedding fails.
 */
export class RagError extends AppError {
  constructor(message: string, cause?: unknown) {
    super(message, 'RAG_ERROR', 500, { cause });
  }
}
