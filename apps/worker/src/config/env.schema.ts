import { intFromEnv, nodeEnvSchema, portFromEnv } from '@email-ai/config';
import { EMAIL_ANALYSIS_QUEUE_NAME } from '@email-ai/contracts';
import { z } from 'zod';

export const workerEnvSchema = z.object({
  NODE_ENV: nodeEnvSchema,

  REDIS_HOST: z.string().trim().default('localhost'),
  REDIS_PORT: portFromEnv(6379),
  REDIS_PASSWORD: z.string().optional(),
  REDIS_DB: z.coerce.number().int().min(0).default(0),

  WORKER_QUEUE_NAME: z.string().trim().default(EMAIL_ANALYSIS_QUEUE_NAME),
  WORKER_CONCURRENCY: intFromEnv(2, 1),
  WORKER_SHUTDOWN_TIMEOUT_MS: intFromEnv(15_000, 0),
});

export type WorkerEnv = z.infer<typeof workerEnvSchema>;
