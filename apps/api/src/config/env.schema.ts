import {
  booleanFromEnv,
  csvFromEnv,
  intFromEnv,
  nodeEnvSchema,
  portFromEnv,
} from '@email-ai/config';
import { EMAIL_ANALYSIS_QUEUE_NAME } from '@email-ai/contracts';
import { z } from 'zod';

/**
 * Every environment variable the API reads. Validation happens once, before the
 * Nest application is created, so a misconfigured process fails immediately
 * instead of at the first request.
 */
export const apiEnvSchema = z.object({
  NODE_ENV: nodeEnvSchema,
  API_PORT: portFromEnv(3000),
  API_GLOBAL_PREFIX: z.string().trim().default('api'),
  CORS_ORIGINS: csvFromEnv(['http://localhost:5173']),
  SWAGGER_ENABLED: booleanFromEnv(true),

  DATABASE_ENABLED: booleanFromEnv(true),
  POSTGRES_HOST: z.string().trim().default('localhost'),
  POSTGRES_PORT: portFromEnv(5432),
  POSTGRES_USER: z.string().trim().default('email_ai'),
  POSTGRES_PASSWORD: z.string().default('email_ai_local_password'),
  POSTGRES_DB: z.string().trim().default('email_ai'),
  DATABASE_LOGGING: booleanFromEnv(false),

  REDIS_HOST: z.string().trim().default('localhost'),
  REDIS_PORT: portFromEnv(6379),
  REDIS_PASSWORD: z.string().optional(),
  REDIS_DB: z.coerce.number().int().min(0).default(0),

  WORKER_QUEUE_NAME: z.string().trim().default(EMAIL_ANALYSIS_QUEUE_NAME),

  // --- AI service (apps/ai-service) --------------------------------------
  // The API performs no AI work of its own: it calls the Python AI service,
  // which owns the OpenAI credential, the prompts and the model routing. None
  // of the provider variables (`LLM_*`, `OPENAI_*`) is read here — they belong
  // to that service's configuration.
  //
  // `false` (the default) keeps the whole stack runnable with no AI at all:
  // every other endpoint works and POST /emails/:id/analyze answers 503 with
  // an explicit configuration error.
  AI_SERVICE_ENABLED: booleanFromEnv(false),
  /** Base URL of the AI service. Internal; never exposed to the browser. */
  AI_SERVICE_URL: z.string().trim().url().default('http://127.0.0.1:8000'),
  /**
   * Shared secret presented to the AI service as a bearer token. Optional for
   * loopback development; the AI service refuses to start without one when it
   * binds to a reachable address.
   */
  AI_SERVICE_TOKEN: z.string().trim().optional(),
  /**
   * Deadline for the AI service to answer. Deliberately above its own
   * `LLM_TIMEOUT_MS`, so a slow provider is recorded as a provider timeout
   * (with its model accounting) rather than as a transport failure.
   */
  AI_SERVICE_REQUEST_TIMEOUT_MS: intFromEnv(90_000, 1_000),
  /** Deadline for establishing the connection, as opposed to answering. */
  AI_SERVICE_CONNECT_TIMEOUT_MS: intFromEnv(2_000, 100),

  /**
   * How long an analysis may sit in `processing` before another request may
   * reclaim it. Covers a crashed or killed process, not provider slowness.
   *
   * Keeps its name: it is the analysis lifecycle's own setting, owned by this
   * API, and renaming it would invalidate existing deployments' `.env`.
   */
  LLM_STALE_PROCESSING_MS: intFromEnv(300_000, 1_000),
});

export type ApiEnv = z.infer<typeof apiEnvSchema>;
