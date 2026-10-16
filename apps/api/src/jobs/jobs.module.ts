import { Module } from '@nestjs/common';
import { JobsService } from './jobs.service.js';

/** Producer side of the email-analysis queue; the worker owns the consumer. */
@Module({
  providers: [JobsService],
  exports: [JobsService],
})
export class JobsModule {}
