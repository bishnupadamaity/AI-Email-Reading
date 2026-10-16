import { Global, Module } from '@nestjs/common';
import { loadWorkerConfig, type WorkerConfig } from './configuration.js';

export const WORKER_CONFIG = Symbol('WORKER_CONFIG');

@Global()
@Module({
  providers: [{ provide: WORKER_CONFIG, useFactory: (): WorkerConfig => loadWorkerConfig() }],
  exports: [WORKER_CONFIG],
})
export class WorkerConfigModule {}
