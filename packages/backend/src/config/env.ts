import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z
    .enum(['development', 'production', 'test'])
    .default('development'),
  PORT: z.coerce.number().default(3000),
  ALLOWED_ORIGIN: z.string().default('http://localhost:4200'),

  // Database
  DATABASE_URL: z.string().url(),

  // Redis
  REDIS_URL: z.string().url(),

  // Anthropic API
  ANTHROPIC_API_KEY: z.string().min(1, 'ANTHROPIC_API_KEY is required'),

  // OpenAI API (for embeddings)
  OPENAI_API_KEY: z.string().min(1, 'OPENAI_API_KEY is required'),

  // MCP server binary path (spawned as child process)
  MCP_SERVER_PATH: z.string().min(1, 'MCP_SERVER_PATH is required'),

  // Logging
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('debug'),
});

export type Env = z.infer<typeof envSchema>;

// Parse and validate environment variables at module load
// This will throw and crash the process if validation fails
export const env = envSchema.parse(process.env);
