import { Inject, Injectable, Logger, type OnApplicationShutdown } from '@nestjs/common';
import { EmailAnalysisJob, type AnalyzeEmailJobData } from '@email-ai/contracts';
import { Queue } from 'bullmq';
import { API_CONFIG, type ApiConfig } from '../config/index.js';

/**
 * The API's only means of handing work to `apps/worker`. Feature modules
 * enqueue through this service instead of touching BullMQ directly.
 *
 * The queue is constructed on first use rather than at startup: BullMQ opens
 * its connection eagerly, so building it in the DI factory would make the API
 * unstartable (and very noisy) whenever Redis is unavailable — including for
 * front-end-only development.
 */
@Injectable()
export class JobsService implements OnApplicationShutdown {
  private readonly logger = new Logger(JobsService.name);
  private queue?: Queue;

  constructor(@Inject(API_CONFIG) private readonly config: ApiConfig) {}

  /** Publishes an analysis request. Resolves once Redis has accepted the job. */
  async enqueueEmailAnalysis(data: AnalyzeEmailJobData): Promise<string> {
    const job = await this.getQueue().add(EmailAnalysisJob.Analyze, data, {
      attempts: 3,
      backoff: { type: 'exponential', delay: 2_000 },
      removeOnComplete: { count: 500 },
      removeOnFail: { count: 1_000 },
    });

    this.logger.log(`Enqueued ${EmailAnalysisJob.Analyze} job ${job.id} for email ${data.emailId}`);
    return job.id ?? '';
  }

  async onApplicationShutdown(): Promise<void> {
    await this.queue?.close();
    this.queue = undefined;
  }

  private getQueue(): Queue {
    if (this.queue) return this.queue;

    const queue = new Queue(this.config.queueName, {
      connection: { ...this.config.redis, maxRetriesPerRequest: null },
    });

    // Without a listener, ioredis reconnection failures surface as unhandled
    // errors; this keeps them as one readable log line each.
    queue.on('error', (error) => {
      this.logger.error(`Queue "${this.config.queueName}" connection error: ${error.message}`);
    });

    this.queue = queue;
    return queue;
  }
}
