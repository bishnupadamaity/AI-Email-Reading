import { loadEnv } from '@email-ai/config';
import { workerEnvSchema, type WorkerEnv } from './env.schema.js';

export interface WorkerConfig {
  readonly nodeEnv: WorkerEnv['NODE_ENV'];
  readonly queueName: string;
  readonly concurrency: number;
  readonly shutdownTimeoutMs: number;
  readonly redis: {
    readonly host: string;
    readonly port: number;
    readonly password?: string;
    readonly db: number;
  };
}

export function buildWorkerConfig(env: WorkerEnv): WorkerConfig {
  return {
    nodeEnv: env.NODE_ENV,
    queueName: env.WORKER_QUEUE_NAME,
    concurrency: env.WORKER_CONCURRENCY,
    shutdownTimeoutMs: env.WORKER_SHUTDOWN_TIMEOUT_MS,
    redis: {
      host: env.REDIS_HOST,
      port: env.REDIS_PORT,
      ...(env.REDIS_PASSWORD ? { password: env.REDIS_PASSWORD } : {}),
      db: env.REDIS_DB,
    },
  };
}

let cached: WorkerConfig | undefined;

export function loadWorkerConfig(): WorkerConfig {
  cached ??= buildWorkerConfig(loadEnv(workerEnvSchema, { appName: 'worker' }));
  return cached;
}
