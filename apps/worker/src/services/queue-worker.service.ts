import {
  Inject,
  Injectable,
  Logger,
  type OnApplicationShutdown,
  type OnModuleInit,
} from '@nestjs/common';
import { Worker, type Job } from 'bullmq';
import { WORKER_CONFIG, type WorkerConfig } from '../config/index.js';
import {
  EmailAnalysisProcessor,
  type ProcessorResult,
} from '../processors/email-analysis.processor.js';

/**
 * Owns the BullMQ consumer lifecycle.
 *
 * Nest's shutdown hooks drive `onApplicationShutdown`, where the worker is
 * closed so in-flight jobs finish instead of being abandoned to a stalled-job
 * timeout.
 */
@Injectable()
export class QueueWorkerService implements OnModuleInit, OnApplicationShutdown {
  private readonly logger = new Logger(QueueWorkerService.name);
  private worker?: Worker;

  constructor(
    @Inject(WORKER_CONFIG) private readonly config: WorkerConfig,
    private readonly processor: EmailAnalysisProcessor,
  ) {}

  onModuleInit(): void {
    const { queueName, concurrency, redis } = this.config;

    this.worker = new Worker(
      queueName,
      (job: Job): Promise<ProcessorResult> => this.processor.process(job),
      {
        connection: { ...redis, maxRetriesPerRequest: null },
        concurrency,
      },
    );

    this.worker.on('completed', (job, result: ProcessorResult) => {
      this.logger.log(`Job ${job.id} completed: ${result.status}`);
    });

    this.worker.on('failed', (job, error) => {
      this.logger.error(`Job ${job?.id ?? 'unknown'} failed: ${error.message}`);
    });

    this.worker.on('error', (error) => {
      // Connection-level problems arrive here; BullMQ reconnects on its own.
      this.logger.error(`Queue worker error: ${error.message}`);
    });

    this.logger.log(`Consuming queue "${queueName}" with concurrency ${concurrency}`);
  }

  /** Resolves `true` if `task` settled within `timeoutMs`, `false` on timeout. */
  private async withTimeout(task: Promise<void>, timeoutMs: number): Promise<boolean> {
    if (timeoutMs <= 0) {
      await task;
      return true;
    }

    let timer: NodeJS.Timeout | undefined;
    const expired = new Promise<false>((resolve) => {
      timer = setTimeout(() => resolve(false), timeoutMs);
    });

    try {
      return await Promise.race([task.then(() => true), expired]);
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  async onApplicationShutdown(signal?: string): Promise<void> {
    if (!this.worker) return;

    const worker = this.worker;
    this.worker = undefined;
    const { shutdownTimeoutMs } = this.config;

    this.logger.log(
      `Shutting down (${signal ?? 'no signal'}); waiting up to ${shutdownTimeoutMs}ms for in-flight jobs`,
    );

    const graceful = await this.withTimeout(worker.close(), shutdownTimeoutMs);
    if (!graceful) {
      this.logger.warn('Grace period elapsed; forcing the queue worker closed');
      await worker.close(true);
    }

    this.logger.log('Queue worker closed');
  }
}
