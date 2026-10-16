import { Module } from '@nestjs/common';
import { WorkerConfigModule } from './config/index.js';
import { EmailAnalysisProcessor } from './processors/email-analysis.processor.js';
import { QueueWorkerService } from './services/queue-worker.service.js';

/**
 * The worker runs as a standalone Nest application context: it has no HTTP
 * surface, and shares only packages (not modules) with `apps/api`.
 */
@Module({
  imports: [WorkerConfigModule],
  providers: [EmailAnalysisProcessor, QueueWorkerService],
})
export class WorkerModule {}
