import 'reflect-metadata';

import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { loadWorkerConfig } from './config/index.js';
import { WorkerModule } from './worker.module.js';

const SHUTDOWN_SIGNALS = ['SIGINT', 'SIGTERM'] as const;

async function bootstrap(): Promise<void> {
  const config = loadWorkerConfig();
  const logger = new Logger('Worker');

  // No HTTP server: an application context gives DI and lifecycle hooks only.
  const app = await NestFactory.createApplicationContext(WorkerModule);

  // Nest closes providers on these signals, which triggers
  // QueueWorkerService.onApplicationShutdown.
  app.enableShutdownHooks([...SHUTDOWN_SIGNALS]);

  logger.log(
    `Worker started (queue "${config.queueName}", redis ${config.redis.host}:${config.redis.port})`,
  );
}

bootstrap().catch((error: unknown) => {
  new Logger('Worker').error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
