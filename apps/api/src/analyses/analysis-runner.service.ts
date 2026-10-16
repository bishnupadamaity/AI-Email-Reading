import {
  ConflictException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import {
  shipmentExtractionSchema,
  type AiExtractResponse,
  type AnalysisDetail,
  type AnalysisFailureCode,
  type AnalysisModelMetadata,
  type OperationMetadata,
  type ShipmentExtraction,
  type ValidationIssue,
} from '@email-ai/contracts';
import { QueryFailedError, Repository } from 'typeorm';
import { AI_SERVICE, AiServiceError, type AiService } from '../ai/index.js';
import { API_CONFIG, type ApiConfig } from '../config/index.js';
import { Email } from '../emails/email.entity.js';
import { Analysis } from './analysis.entity.js';
import { toAnalysisDetail } from './analysis.mapper.js';

/** PostgreSQL `unique_violation`. */
const UNIQUE_VIOLATION = '23505';

/** Result of trying to take ownership of an analysis slot for an email. */
type Claim =
  | { kind: 'claimed'; analysis: Analysis }
  | { kind: 'already_completed'; analysis: Analysis }
  | { kind: 'in_progress' };

/**
 * Runs the analysis operations for one email, synchronously.
 *
 * This service owns the **lifecycle**, not the AI: claim an analysis slot, ask
 * the AI service for the operation, validate what came back, persist exactly
 * one terminal state. The model call, the prompt, the provider credential and
 * the operation-to-model routing all live in `apps/ai-service`; this process
 * holds none of them.
 *
 * Today one operation runs — `extraction`. Classification, summarization and
 * conflict resolution have models configured in the AI service but **no caller
 * yet**: adding a model call per email purely to exercise routing would spend
 * money for nothing.
 *
 * Synchronous on purpose for this slice: it keeps the whole path — claim, call,
 * validate, persist — in one place where it can be verified end to end. Moving
 * it behind the queue is the next step, and the claim/finish split below is
 * already shaped for a worker to take over.
 *
 * The AI call deliberately happens *outside* any database transaction: it takes
 * seconds, and holding a transaction open across it would pin a connection and
 * risk lock timeouts. Consistency comes instead from an atomic claim (a
 * conditional `UPDATE`) plus a single terminal `UPDATE`.
 */
@Injectable()
export class AnalysisRunnerService {
  private readonly logger = new Logger(AnalysisRunnerService.name);

  constructor(
    @InjectRepository(Analysis)
    private readonly analyses: Repository<Analysis>,
    @InjectRepository(Email)
    private readonly emails: Repository<Email>,
    @Inject(AI_SERVICE)
    private readonly ai: AiService,
    @Inject(API_CONFIG)
    private readonly config: ApiConfig,
  ) {}

  async run(emailId: string): Promise<AnalysisDetail> {
    const email = await this.emails.findOne({ where: { id: emailId } });
    if (!email) throw new NotFoundException(`Email ${emailId} was not found`);

    // Checked before claiming so a misconfigured deployment does not consume
    // the email's pending analysis on every attempt.
    if (!this.config.aiService.enabled) {
      throw new ServiceUnavailableException(
        'Analysis is unavailable: the AI service is not configured. Set AI_SERVICE_ENABLED=true ' +
          'and AI_SERVICE_URL here, and LLM_PROVIDER=openai with OPENAI_API_KEY in apps/ai-service.',
      );
    }

    const claim = await this.claim(emailId);

    if (claim.kind === 'in_progress') {
      throw new ConflictException(`An analysis for email ${emailId} is already in progress`);
    }

    if (claim.kind === 'already_completed') {
      // Idempotent: re-posting does not spend tokens a second time.
      this.logger.log(
        `Email ${emailId} already analysed (${claim.analysis.id}); returning stored result`,
      );
      return toAnalysisDetail(claim.analysis);
    }

    return this.execute(claim.analysis, email);
  }

  // --- claiming -----------------------------------------------------------

  /**
   * Takes exclusive ownership of an analysis slot for this email.
   *
   * Every branch is race-safe: transitions are conditional on the status the
   * caller observed, and the new-run branch is guarded by the
   * `uq_analyses_email_in_flight` unique index.
   */
  private async claim(emailId: string): Promise<Claim> {
    const latest = await this.analyses.findOne({
      where: { emailId },
      order: { createdAt: 'DESC', id: 'DESC' },
    });

    if (latest?.status === 'completed') {
      return { kind: 'already_completed', analysis: latest };
    }

    if (latest?.status === 'pending') {
      const claimed = await this.startRun(latest.id, 'pending');
      return claimed ? { kind: 'claimed', analysis: claimed } : { kind: 'in_progress' };
    }

    if (latest?.status === 'processing') {
      // Only reclaim a run that is demonstrably abandoned — a crashed process
      // leaves `processing` behind, and without this the in-flight index would
      // block the email forever.
      const cutoff = new Date(Date.now() - this.config.staleProcessingMs);
      const reclaimed = await this.startRun(latest.id, 'processing', cutoff);

      if (reclaimed) {
        this.logger.warn(`Reclaimed stale analysis ${latest.id} for email ${emailId}`);
        return { kind: 'claimed', analysis: reclaimed };
      }
      return { kind: 'in_progress' };
    }

    // No analysis yet, or the most recent one failed: start a fresh run and
    // keep the failed row as history.
    try {
      const created = await this.analyses.save(
        this.analyses.create({ emailId, status: 'processing', startedAt: new Date() }),
      );
      return { kind: 'claimed', analysis: created };
    } catch (error: unknown) {
      if (this.isUniqueViolation(error)) return { kind: 'in_progress' };
      throw error;
    }
  }

  /**
   * Moves an analysis to `processing`, but only if it still has the status the
   * caller saw. Returns `null` when another request got there first.
   */
  private async startRun(
    id: string,
    expectedStatus: 'pending' | 'processing',
    staleBefore?: Date,
  ): Promise<Analysis | null> {
    const query = this.analyses
      .createQueryBuilder()
      .update(Analysis)
      .set({ status: 'processing', startedAt: new Date() })
      .where('id = :id AND status = :expectedStatus', { id, expectedStatus });

    if (staleBefore) {
      query.andWhere('(started_at IS NULL OR started_at < :staleBefore)', { staleBefore });
    }

    const result = await query.execute();
    if (!result.affected) return null;

    // Safe to re-read: this row is now ours, and no other request can claim it.
    return this.analyses.findOne({ where: { id } });
  }

  // --- running ------------------------------------------------------------

  private async execute(analysis: Analysis, email: Email): Promise<AnalysisDetail> {
    let outcome: AiExtractResponse;

    try {
      // Routed by operation, not by model name: the AI service resolves
      // `extraction` through its own model registry.
      outcome = await this.ai.extract({
        operation: 'extraction',
        email: {
          id: email.id,
          sender: email.sender,
          subject: email.subject,
          receivedAt: email.receivedAt.toISOString(),
          bodyText: email.bodyText,
        },
      });
    } catch (error: unknown) {
      return this.handleTransportFailure(analysis.id, error);
    }

    const operations = outcome.operation ? [outcome.operation] : [];
    if (outcome.operation) this.logOperation(analysis.id, outcome.operation);

    if (outcome.status === 'failed') {
      // A recorded AI outcome: refusal, timeout, rate limit, unusable or
      // self-contradictory output. The run happened, so it is persisted with
      // the code and whatever accounting the call produced.
      this.logger.warn(
        `Analysis ${analysis.id} failed: ${String(outcome.failureCode)} — ${String(outcome.failureMessage)}`,
      );
      return await this.finish(analysis.id, {
        status: 'failed',
        failureCode: this.toFailureCode(outcome.failureCode),
        failureMessage: outcome.failureMessage ?? 'The AI service reported a failed extraction.',
        validationErrors: outcome.validationErrors ?? null,
        operations,
      });
    }

    // The AI service validated this against the same contract, in Pydantic.
    // It is re-validated here because it crossed a process boundary, and
    // because the schema — not the sender — decides what may be stored.
    const parsed = shipmentExtractionSchema.safeParse(outcome.extraction);

    if (!parsed.success) {
      const issues: ValidationIssue[] = parsed.error.issues.map((issue) => ({
        path: issue.path.map(String).join('.') || '(root)',
        message: issue.message,
      }));

      this.logger.warn(
        `Analysis ${analysis.id} rejected: the AI service reported success but its extraction failed the schema (${issues.length} issue(s))`,
      );
      return await this.finish(analysis.id, {
        status: 'failed',
        failureCode: 'invalid_output',
        failureMessage: 'The AI service returned output that did not match the extraction schema.',
        validationErrors: issues,
        operations,
      });
    }

    return this.completeOrRecordFailure(analysis.id, parsed.data, operations);
  }

  /**
   * No outcome to record: the AI service could not be reached, timed out, or
   * answered something that is not the contract.
   *
   * A configuration failure is surfaced as a `503` — an operator must act, and
   * no email will succeed until they do — mirroring how an unconfigured
   * provider behaved before the AI service existed.
   */
  private async handleTransportFailure(id: string, error: unknown): Promise<AnalysisDetail> {
    if (error instanceof AiServiceError) {
      if (error.isConfiguration) {
        await this.recordFailure(id, 'configuration', error.message, []);
        throw new ServiceUnavailableException(error.message);
      }

      this.logger.warn(`Analysis ${id} failed: ${error.code} — ${error.message}`);
      return await this.finish(id, {
        status: 'failed',
        failureCode: error.code,
        failureMessage: error.message,
        validationErrors: null,
        operations: [],
      });
    }

    // Unknown failure: record it, then let the global filter report a 500
    // without leaking internals.
    await this.recordFailure(id, 'unavailable', 'An unexpected error occurred.', []);
    throw error;
  }

  // --- per-operation accounting -------------------------------------------

  /**
   * The AI service reports the failure codes from the shared vocabulary, so
   * they persist as-is. Anything unrecognised is recorded as `unavailable`
   * rather than written through unchecked — the column feeds a typed contract.
   */
  private toFailureCode(code: string | null): AnalysisFailureCode {
    const known: readonly AnalysisFailureCode[] = [
      'configuration',
      'timeout',
      'rate_limited',
      'unavailable',
      'input_too_large',
      'refused',
      'invalid_response',
      'invalid_output',
      'persistence',
    ];

    const match = known.find((candidate) => candidate === code);
    if (match) return match;

    this.logger.warn(`AI service reported an unknown failure code "${String(code)}"`);
    return 'unavailable';
  }

  /** Ids, routing and accounting only — never prompt or email content. */
  private logOperation(analysisId: string, operation: OperationMetadata): void {
    this.logger.log(
      `Analysis ${analysisId}: ${operation.operation} on ${operation.model} ` +
        `(${operation.provider}) ${operation.status} in ${operation.latencyMs}ms ` +
        `[in ${String(operation.inputTokens)}, out ${String(operation.outputTokens)}, ` +
        `cached ${String(operation.cachedInputTokens)}]`,
    );
  }

  /**
   * Legacy single-model view, derived from the operation that produced the
   * result. Kept so clients reading `modelMetadata` keep working.
   */
  private legacyMetadata(operations: OperationMetadata[]): AnalysisModelMetadata | null {
    const source = operations.find((op) => op.operation === 'extraction') ?? operations[0];
    if (!source) return null;

    return {
      provider: source.provider,
      model: source.model,
      inputTokens: source.inputTokens,
      outputTokens: source.outputTokens,
      cacheReadInputTokens: source.cachedInputTokens,
      latencyMs: source.latencyMs,
      stopReason: source.stopReason,
    };
  }

  /**
   * Writes the successful result, and refuses to leave the row `processing` if
   * that write fails — a stuck row would block every future attempt until the
   * staleness window elapsed.
   */
  private async completeOrRecordFailure(
    id: string,
    extracted: ShipmentExtraction,
    operations: OperationMetadata[],
  ): Promise<AnalysisDetail> {
    try {
      return await this.finish(id, {
        status: 'completed',
        failureCode: null,
        failureMessage: null,
        validationErrors: null,
        operations,
        extractedData: extracted,
      });
    } catch (error: unknown) {
      this.logger.error(
        `Analysis ${id} extracted successfully but could not be persisted`,
        error instanceof Error ? error.stack : String(error),
      );
      await this.recordFailure(
        id,
        'persistence',
        'The extraction could not be stored.',
        operations,
      );
      throw error;
    }
  }

  /** Best-effort terminal write used on error paths; never throws. */
  private async recordFailure(
    id: string,
    failureCode: AnalysisFailureCode,
    failureMessage: string,
    operations: OperationMetadata[],
  ): Promise<void> {
    try {
      await this.finish(id, {
        status: 'failed',
        failureCode,
        failureMessage,
        validationErrors: null,
        operations,
      });
    } catch (error: unknown) {
      // The staleness window is the backstop if even this write fails.
      this.logger.error(
        `Analysis ${id} could not be marked failed; it will be reclaimable after the staleness window`,
        error instanceof Error ? error.stack : String(error),
      );
    }
  }

  /** Single terminal transition. An analysis reaches `completed` only here. */
  private async finish(
    id: string,
    update: {
      status: 'completed' | 'failed';
      failureCode: AnalysisFailureCode | null;
      failureMessage: string | null;
      validationErrors: ValidationIssue[] | null;
      operations: OperationMetadata[];
      extractedData?: ShipmentExtraction;
    },
  ): Promise<AnalysisDetail> {
    const legacy = this.legacyMetadata(update.operations);

    await this.analyses.update(
      { id },
      {
        status: update.status,
        completedAt: new Date(),
        failureCode: update.failureCode,
        failureMessage: update.failureMessage,
        validationErrors: update.validationErrors,
        operationMetadata: update.operations.length > 0 ? update.operations : null,
        // Backward-compatible single-model view of the same run.
        modelMetadata: legacy,
        modelName: legacy?.model ?? null,
        extractedData: update.extractedData ?? null,
      },
    );

    const analysis = await this.analyses.findOne({ where: { id } });
    if (!analysis) throw new NotFoundException(`Analysis ${id} was not found`);

    this.logger.log(`Analysis ${id} → ${analysis.status}`);
    return toAnalysisDetail(analysis);
  }

  private isUniqueViolation(error: unknown): boolean {
    return (
      error instanceof QueryFailedError &&
      (error.driverError as { code?: string } | undefined)?.code === UNIQUE_VIOLATION
    );
  }
}
