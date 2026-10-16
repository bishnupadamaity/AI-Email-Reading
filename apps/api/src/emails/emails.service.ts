import { ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import {
  type CreateEmail,
  type EmailDetail,
  type EmailSummary,
  type Paginated,
  type PaginationQuery,
} from '@email-ai/contracts';
import { DataSource, QueryFailedError, Repository, type FindOptionsSelect } from 'typeorm';
import { AnalysesService } from '../analyses/analyses.service.js';
import { Email } from './email.entity.js';
import { toEmailDetail, toEmailSummary } from './email.mapper.js';

/** PostgreSQL `unique_violation`. */
const UNIQUE_VIOLATION = '23505';

/** Columns backing the list projection; keeps `body_text` out of list queries. */
const SUMMARY_SELECT: FindOptionsSelect<Email> = {
  id: true,
  externalMessageId: true,
  emailAccountId: true,
  sender: true,
  subject: true,
  receivedAt: true,
  processingStatus: true,
  createdAt: true,
};

@Injectable()
export class EmailsService {
  private readonly logger = new Logger(EmailsService.name);

  constructor(
    @InjectRepository(Email)
    private readonly emails: Repository<Email>,
    private readonly dataSource: DataSource,
    private readonly analyses: AnalysesService,
  ) {}

  /**
   * Persists an ingested email together with its pending analysis.
   *
   * Both rows commit in one transaction: an email without an analysis row
   * would be invisible to the pipeline that later picks work up.
   */
  async create(input: CreateEmail): Promise<EmailDetail> {
    try {
      return await this.dataSource.transaction(async (manager) => {
        const email = manager.create(Email, {
          externalMessageId: input.externalMessageId ?? null,
          emailAccountId: input.emailAccountId ?? null,
          sender: input.sender,
          subject: input.subject,
          bodyText: input.bodyText,
          receivedAt: new Date(input.receivedAt),
          processingStatus: 'received' as const,
        });

        const saved = await manager.save(email);
        const analysis = await this.analyses.createPending(manager, saved.id);

        this.logger.log(`Ingested email ${saved.id} (analysis ${analysis.id})`);
        return toEmailDetail(saved, analysis);
      });
    } catch (error: unknown) {
      throw this.translatePersistenceError(error, input);
    }
  }

  async findPaginated({ page, pageSize }: PaginationQuery): Promise<Paginated<EmailSummary>> {
    const [rows, total] = await this.emails.findAndCount({
      select: SUMMARY_SELECT,
      // `id` breaks ties so a row cannot appear on two pages when several
      // emails share a received_at.
      order: { receivedAt: 'DESC', id: 'DESC' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    });

    return { items: rows.map(toEmailSummary), page, pageSize, total };
  }

  async findById(id: string): Promise<EmailDetail> {
    const email = await this.emails.findOne({ where: { id } });
    if (!email) throw new NotFoundException(`Email ${id} was not found`);

    return toEmailDetail(email, await this.analyses.findLatestForEmail(id));
  }

  /**
   * Converts a driver error into a client-safe HTTP error. Anything not
   * recognised is rethrown for the global filter to log and report as a 500,
   * so database internals never reach the client.
   */
  private translatePersistenceError(error: unknown, input: CreateEmail): unknown {
    if (error instanceof QueryFailedError) {
      const code = (error.driverError as { code?: string } | undefined)?.code;

      if (code === UNIQUE_VIOLATION) {
        this.logger.warn(
          `Rejected duplicate email: externalMessageId=${String(input.externalMessageId)} emailAccountId=${String(input.emailAccountId)}`,
        );
        return new ConflictException(
          'An email with this externalMessageId already exists for this email account',
        );
      }
    }

    return error;
  }
}
