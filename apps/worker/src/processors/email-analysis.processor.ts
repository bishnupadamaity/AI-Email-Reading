import { Injectable, Logger } from '@nestjs/common';
import { EmailAnalysisJob, analyzeEmailJobDataSchema } from '@email-ai/contracts';
import { type Job } from 'bullmq';

export interface ProcessorResult {
  readonly status: 'skipped';
  readonly reason: string;
}

/**
 * Entry point for jobs on the email-analysis queue.
 *
 * The queued analysis path is not implemented: this validates the payload,
 * records that the job was consumed and returns an explicit `skipped` result so
 * the queue is observably wired without pretending work was performed.
 *
 * Analysis currently runs synchronously in `apps/api`, which calls the Python
 * AI service (`apps/ai-service`) over HTTP. When this path is implemented the
 * worker becomes the caller instead; nothing about the AI service changes.
 */
@Injectable()
export class EmailAnalysisProcessor {
  private readonly logger = new Logger(EmailAnalysisProcessor.name);

  async process(job: Job): Promise<ProcessorResult> {
    if (job.name !== EmailAnalysisJob.Analyze) {
      throw new Error(`Unsupported job name "${job.name}" on the email-analysis queue`);
    }

    // Payloads come off the wire untyped; validate before acting on them.
    const data = analyzeEmailJobDataSchema.parse(job.data);
    this.logger.log(`Received ${job.name} job ${job.id} for email ${data.emailId}`);

    return Promise.resolve({
      status: 'skipped',
      reason: 'Queued analysis is not implemented yet; the API analyses synchronously.',
    });
  }
}
