import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Email } from '../emails/email.entity.js';
import { AnalysesController } from './analyses.controller.js';
import { AnalysesService } from './analyses.service.js';
import { AnalysisRunnerService } from './analysis-runner.service.js';
import { Analysis } from './analysis.entity.js';

/**
 * `Email` is registered here as well because the runner reads the message it
 * is about to analyse. Registering the entity is additive and avoids a
 * circular dependency on `EmailsModule`.
 */
@Module({
  imports: [TypeOrmModule.forFeature([Analysis, Email])],
  controllers: [AnalysesController],
  providers: [AnalysesService, AnalysisRunnerService],
  // EmailsModule records a pending analysis on ingestion, and exposes the
  // POST /emails/:id/analyze route that drives a run.
  exports: [AnalysesService, AnalysisRunnerService],
})
export class AnalysesModule {}
