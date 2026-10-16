import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AnalysesModule } from '../analyses/analyses.module.js';
import { Email } from './email.entity.js';
import { EmailsController } from './emails.controller.js';
import { EmailsService } from './emails.service.js';

@Module({
  imports: [TypeOrmModule.forFeature([Email]), AnalysesModule],
  controllers: [EmailsController],
  providers: [EmailsService],
})
export class EmailsModule {}
