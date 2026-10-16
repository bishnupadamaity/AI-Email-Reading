import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { type AnalysisDetail } from '@email-ai/contracts';
import { Repository, type EntityManager } from 'typeorm';
import { Analysis } from './analysis.entity.js';
import { toAnalysisDetail } from './analysis.mapper.js';

@Injectable()
export class AnalysesService {
  constructor(
    @InjectRepository(Analysis)
    private readonly analyses: Repository<Analysis>,
  ) {}

  /**
   * Records the pending analysis that accompanies a newly ingested email.
   *
   * Takes the caller's `EntityManager` so the email and its analysis commit in
   * one transaction — an email with no analysis row would be invisible to the
   * pipeline that picks work up.
   *
   * This only records intent; nothing is dispatched or executed here.
   */
  createPending(manager: EntityManager, emailId: string): Promise<Analysis> {
    const analysis = manager.create(Analysis, { emailId, status: 'pending' as const });
    return manager.save(analysis);
  }

  /** Most recent analysis for an email, or `null` if it has none. */
  findLatestForEmail(emailId: string): Promise<Analysis | null> {
    return this.analyses.findOne({
      where: { emailId },
      order: { createdAt: 'DESC', id: 'DESC' },
    });
  }

  async findById(id: string): Promise<AnalysisDetail> {
    const analysis = await this.analyses.findOne({ where: { id } });
    if (!analysis) throw new NotFoundException(`Analysis ${id} was not found`);

    return toAnalysisDetail(analysis);
  }
}
