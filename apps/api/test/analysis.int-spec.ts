import { type INestApplication } from '@nestjs/common';
import request from 'supertest';
import { type DataSource } from 'typeorm';
import { AI_SERVICE } from '../src/ai/index.js';
import { API_CONFIG, loadApiConfig, type ApiConfig } from '../src/config/index.js';
import {
  FAKE_MODELS,
  FAKE_USAGE,
  FakeAiService,
  VALID_EXTRACTION,
} from './support/fake-ai-service.js';
import { createTestApp, type TestApp } from './support/test-app.js';
import { isPostgresReachable } from './support/test-database.js';

const EMAIL = {
  sender: 'Acme Logistics <dispatch@acme-logistics.example>',
  subject: 'Shipment confirmation - PO 4821 / container MSCU7654321',
  bodyText: 'Container MSCU7654321 departs Rotterdam 2026-02-02 for Singapore, ETA 2026-02-24.',
  receivedAt: '2026-02-02T08:14:00.000Z',
};

const UNKNOWN_ID = '11111111-1111-4111-8111-111111111111';

/**
 * The analysis lifecycle, with the AI service replaced at its port.
 *
 * What the API owns is tested here: claiming, status transitions, boundary
 * validation of the AI service's response, failure-code mapping, persistence,
 * idempotency and concurrency. What the AI service owns — prompts, model
 * routing, Pydantic validation, the deterministic integrity checks — is tested
 * in `apps/ai-service/tests`, and the shared fixtures in `test/fixtures/` keep
 * the two contracts in step.
 */
describe('Email analysis (integration)', () => {
  let harness: TestApp;
  let app: INestApplication;
  let dataSource: DataSource;
  const ai = new FakeAiService();

  beforeAll(async () => {
    if (!(await isPostgresReachable())) {
      throw new Error(
        'PostgreSQL is not reachable. Start it with `pnpm infra:up` before running the integration suite.',
      );
    }

    // The AI service is enabled at the config boundary and replaced wholesale:
    // no AI service runs, no key is read, and no request leaves the process.
    const real = loadApiConfig();
    const config: ApiConfig = {
      ...real,
      aiService: {
        ...real.aiService,
        enabled: true,
        baseUrl: 'http://127.0.0.1:9',
        token: 'test-token-not-used',
      },
      staleProcessingMs: 60_000,
    };

    harness = await createTestApp((builder) =>
      builder
        .overrideProvider(API_CONFIG)
        .useValue(config)
        .overrideProvider(AI_SERVICE)
        .useValue(ai),
    );
    app = harness.app;
    dataSource = harness.dataSource;
  });

  afterAll(async () => {
    await harness?.close();
  });

  beforeEach(async () => {
    await harness.reset();
    ai.reset();
  });

  /** Ingests an email and returns its id plus its pending analysis id. */
  async function ingest(): Promise<{ emailId: string; analysisId: string }> {
    const { body } = await request(app.getHttpServer())
      .post('/api/v1/emails')
      .send(EMAIL)
      .expect(201);

    return { emailId: body.id, analysisId: body.latestAnalysis.id };
  }

  function analyze(emailId: string) {
    return request(app.getHttpServer()).post(`/api/v1/emails/${emailId}/analyze`);
  }

  /**
   * Starts a request immediately. Supertest is lazy — it only dispatches when
   * the Test object is awaited — so concurrency tests must force the send
   * before they can observe anything in flight.
   */
  function startAnalyze(emailId: string): Promise<request.Response> {
    return analyze(emailId).then((response) => response);
  }

  // --- successful extraction ---------------------------------------------

  describe('successful extraction', () => {
    it('completes the analysis and returns the extracted data', async () => {
      const { emailId, analysisId } = await ingest();

      const response = await analyze(emailId).expect(200);

      expect(response.body).toMatchObject({
        id: analysisId,
        emailId,
        status: 'completed',
        failureCode: null,
        failureMessage: null,
        validationErrors: null,
      });
      expect(response.body.extractedData).toEqual(VALID_EXTRACTION);
    });

    it('records per-operation metadata naming the model that ran', async () => {
      const { emailId } = await ingest();

      const { body } = await analyze(emailId).expect(200);

      expect(body.operations).toHaveLength(1);
      expect(body.operations[0]).toMatchObject({
        operation: 'extraction',
        provider: 'fake',
        model: FAKE_MODELS.extraction,
        status: 'succeeded',
        failureCode: null,
        inputTokens: FAKE_USAGE.inputTokens,
        outputTokens: FAKE_USAGE.outputTokens,
        cachedInputTokens: FAKE_USAGE.cachedInputTokens,
        reasoningTokens: FAKE_USAGE.reasoningTokens,
        latencyMs: 42,
        stopReason: 'completed',
      });
      expect(typeof body.operations[0].completedAt).toBe('string');
    });

    it('keeps the legacy single-model fields populated for compatibility', async () => {
      const { emailId } = await ingest();

      const { body } = await analyze(emailId).expect(200);

      // Pre-existing clients read these; they must still describe the run.
      expect(body.modelName).toBe(FAKE_MODELS.extraction);
      expect(body.modelMetadata).toEqual({
        provider: 'fake',
        model: FAKE_MODELS.extraction,
        inputTokens: FAKE_USAGE.inputTokens,
        outputTokens: FAKE_USAGE.outputTokens,
        cacheReadInputTokens: FAKE_USAGE.cachedInputTokens,
        latencyMs: 42,
        stopReason: 'completed',
      });
    });

    it('requests the extraction operation and makes no other call', async () => {
      const { emailId } = await ingest();

      await analyze(emailId).expect(200);

      // Exactly one AI call: routing is configured for four operations in the
      // AI service, but only extraction has a caller today.
      expect(ai.operations).toEqual(['extraction']);
      expect(ai.callCount).toBe(1);
    });

    it('records timestamps', async () => {
      const { emailId } = await ingest();

      const { body } = await analyze(emailId).expect(200);

      expect(typeof body.startedAt).toBe('string');
      expect(typeof body.completedAt).toBe('string');
      expect(new Date(body.completedAt).getTime()).toBeGreaterThanOrEqual(
        new Date(body.startedAt).getTime(),
      );
    });

    it('persists the extraction and both metadata shapes to the database', async () => {
      const { emailId, analysisId } = await ingest();
      await analyze(emailId).expect(200);

      const rows = await dataSource.query(
        'SELECT status, extracted_data, model_metadata, operation_metadata, model_name, failure_code FROM analyses WHERE id = $1',
        [analysisId],
      );

      expect(rows[0].status).toBe('completed');
      expect(rows[0].extracted_data).toEqual(VALID_EXTRACTION);
      expect(rows[0].operation_metadata).toHaveLength(1);
      expect(rows[0].operation_metadata[0]).toMatchObject({
        operation: 'extraction',
        model: FAKE_MODELS.extraction,
        status: 'succeeded',
      });
      expect(rows[0].model_metadata.model).toBe(FAKE_MODELS.extraction);
      expect(rows[0].model_name).toBe(FAKE_MODELS.extraction);
      expect(rows[0].failure_code).toBeNull();
    });

    it('sends the stored email to the AI service, and no credential with it', async () => {
      const { emailId } = await ingest();
      await analyze(emailId).expect(200);

      expect(ai.callCount).toBe(1);
      const sent = ai.requests[0]!;
      expect(sent.operation).toBe('extraction');
      expect(sent.email.id).toBe(emailId);
      expect(sent.email.bodyText).toContain('MSCU7654321');
      expect(sent.email.subject).toBe(EMAIL.subject);
      expect(sent.email.sender).toBe(EMAIL.sender);
      expect(sent.email.receivedAt).toBe(EMAIL.receivedAt);
      // The API never holds an OpenAI key, and never passes its own token in
      // the payload — it travels as a header, handled by the HTTP client.
      expect(JSON.stringify(sent)).not.toContain('test-token-not-used');
      expect(JSON.stringify(sent)).not.toContain('sk-');
    });

    it('exposes the stored result through GET /api/v1/analyses/:id', async () => {
      const { emailId, analysisId } = await ingest();
      await analyze(emailId).expect(200);

      const { body } = await request(app.getHttpServer())
        .get(`/api/v1/analyses/${analysisId}`)
        .expect(200);

      expect(body).toMatchObject({ status: 'completed', modelName: FAKE_MODELS.extraction });
      expect(body.extractedData.containerNumber.value).toBe('MSCU7654321');
      expect(body.modelMetadata.inputTokens).toBe(1_234);
      expect(body.operations[0].model).toBe(FAKE_MODELS.extraction);
    });

    it('reports the analysis on the email detail response', async () => {
      const { emailId } = await ingest();
      await analyze(emailId).expect(200);

      const { body } = await request(app.getHttpServer())
        .get(`/api/v1/emails/${emailId}`)
        .expect(200);

      expect(body.latestAnalysis.status).toBe('completed');
    });
  });

  // --- status transitions -------------------------------------------------

  describe('status transitions', () => {
    it('moves pending → processing while the AI service is working', async () => {
      const { emailId, analysisId } = await ingest();
      const gate = ai.blocks();

      const inFlight = startAnalyze(emailId);

      // Wait for the claim to land before inspecting.
      let status = '';
      for (let attempt = 0; attempt < 50; attempt += 1) {
        const rows = await dataSource.query(
          'SELECT status, started_at FROM analyses WHERE id = $1',
          [analysisId],
        );
        status = rows[0].status;
        if (status === 'processing') {
          expect(rows[0].started_at).not.toBeNull();
          break;
        }
        await new Promise((resolve) => setTimeout(resolve, 20));
      }
      expect(status).toBe('processing');

      gate.release();
      await expect(inFlight).resolves.toMatchObject({ status: 200 });

      const final = await dataSource.query('SELECT status FROM analyses WHERE id = $1', [
        analysisId,
      ]);
      expect(final[0].status).toBe('completed');
    });

    it('never leaves an analysis in processing after an AI failure', async () => {
      const { emailId, analysisId } = await ingest();
      ai.reportsFailure('unavailable', 'Could not reach the provider.');

      await analyze(emailId).expect(200);

      const rows = await dataSource.query(
        'SELECT status, completed_at FROM analyses WHERE id = $1',
        [analysisId],
      );
      expect(rows[0].status).toBe('failed');
      expect(rows[0].completed_at).not.toBeNull();
    });

    it('never leaves an analysis in processing after a transport failure', async () => {
      const { emailId, analysisId } = await ingest();
      ai.failsTransport('unavailable', 'Could not reach the AI service.');

      await analyze(emailId).expect(200);

      const rows = await dataSource.query(
        'SELECT status, failure_code, operation_metadata FROM analyses WHERE id = $1',
        [analysisId],
      );
      expect(rows[0].status).toBe('failed');
      expect(rows[0].failure_code).toBe('unavailable');
      // No model call is claimed: the request never reached one.
      expect(rows[0].operation_metadata).toBeNull();
    });

    it('marks the analysis failed when the AI client throws an unexpected error', async () => {
      const { emailId, analysisId } = await ingest();
      ai.failsWith(new Error('something unmapped'));

      // Surfaces as a generic 500, with no internals in the body.
      const response = await analyze(emailId).expect(500);
      expect(JSON.stringify(response.body)).not.toContain('something unmapped');

      const rows = await dataSource.query(
        'SELECT status, failure_code FROM analyses WHERE id = $1',
        [analysisId],
      );
      expect(rows[0].status).toBe('failed');
      expect(rows[0].failure_code).toBe('unavailable');
    });
  });

  // --- boundary validation of the AI service's response -------------------

  describe('response that does not match the extraction contract', () => {
    // The AI service validates its own output in Pydantic; the API validates
    // it again because it crossed a process boundary, and because the schema
    // — not the sender — decides what may be stored.

    it('rejects a reported success whose extraction misses a required field', async () => {
      const { emailId } = await ingest();
      const { containerNumber: _dropped, ...incomplete } = VALID_EXTRACTION;
      ai.succeedsWith(incomplete);

      const { body } = await analyze(emailId).expect(200);

      expect(body.status).toBe('failed');
      expect(body.failureCode).toBe('invalid_output');
      expect(body.extractedData).toBeNull();
      expect(body.validationErrors.map((i: { path: string }) => i.path)).toContain(
        'containerNumber',
      );
    });

    it('rejects a classification outside the enum', async () => {
      const { emailId } = await ingest();
      ai.succeedsWith({ ...VALID_EXTRACTION, classification: 'invented_category' });

      const { body } = await analyze(emailId).expect(200);

      expect(body.status).toBe('failed');
      expect(body.failureCode).toBe('invalid_output');
      expect(body.validationErrors.map((i: { path: string }) => i.path)).toContain(
        'classification',
      );
    });

    it('rejects a reported success carrying no extraction at all', async () => {
      const { emailId } = await ingest();
      ai.succeedsWith(null);

      const { body } = await analyze(emailId).expect(200);

      expect(body.status).toBe('failed');
      expect(body.failureCode).toBe('invalid_output');
    });

    it('still records the tokens that were spent on a rejected run', async () => {
      const { emailId } = await ingest();
      ai.succeedsWith({ not: 'an extraction' });

      const { body } = await analyze(emailId).expect(200);

      expect(body.status).toBe('failed');
      // The tokens were spent even though the output was rejected.
      expect(body.operations).toHaveLength(1);
      expect(body.operations[0]).toMatchObject({
        operation: 'extraction',
        model: FAKE_MODELS.extraction,
        status: 'succeeded',
        inputTokens: FAKE_USAGE.inputTokens,
      });
      expect(body.modelMetadata.inputTokens).toBe(FAKE_USAGE.inputTokens);
    });

    it('accepts an extraction that reports conflicts and missing fields', async () => {
      const { emailId } = await ingest();
      ai.succeedsWith({
        ...VALID_EXTRACTION,
        containerNumber: { value: null, evidence: null },
        conflicts: [
          {
            field: 'containerNumber',
            values: ['TGHU1234567', 'TGHU7654321'],
            note: 'booking confirmation and warehouse paperwork disagree',
          },
        ],
      });

      const { body } = await analyze(emailId).expect(200);

      expect(body.status).toBe('completed');
      expect(body.extractedData.conflicts).toHaveLength(1);
      expect(body.extractedData.containerNumber.value).toBeNull();
    });
  });

  // --- failures the AI service reports ------------------------------------

  describe('AI outcomes reported as failures', () => {
    it.each([
      ['timeout', 'timeout'],
      ['rate_limited', 'rate_limited'],
      ['unavailable', 'unavailable'],
      ['refused', 'refused'],
      ['input_too_large', 'input_too_large'],
      ['invalid_response', 'invalid_response'],
    ] as const)('records a %s failure with its code', async (code, expected) => {
      const { emailId } = await ingest();
      ai.reportsFailure(code);

      const { body } = await analyze(emailId).expect(200);

      expect(body).toMatchObject({ status: 'failed', failureCode: expected });
      expect(body.extractedData).toBeNull();
    });

    it('records a failed operation with the model that failed', async () => {
      const { emailId } = await ingest();
      ai.reportsFailure('rate_limited', 'The provider rate-limited this request.');

      const { body } = await analyze(emailId).expect(200);

      expect(body.operations).toHaveLength(1);
      expect(body.operations[0]).toMatchObject({
        operation: 'extraction',
        model: FAKE_MODELS.extraction,
        status: 'failed',
        failureCode: 'rate_limited',
      });
    });

    it('persists the validation errors behind a self-contradictory extraction', async () => {
      // The AI service rejected the extraction deterministically — a
      // conflicted field that was also given a single value — and the API
      // records its finding without reinterpreting it.
      const { emailId } = await ingest();
      ai.reportsFailure(
        'invalid_output',
        'The model returned a self-contradictory extraction; conflicting evidence must be preserved, not resolved.',
        [
          {
            path: 'containerNumber',
            message:
              '"containerNumber" is reported as conflicting, but a single value was also recorded.',
          },
        ],
        'succeeded',
      );

      const { body } = await analyze(emailId).expect(200);

      expect(body.status).toBe('failed');
      expect(body.failureCode).toBe('invalid_output');
      expect(body.extractedData).toBeNull();
      expect(body.validationErrors.map((i: { path: string }) => i.path)).toContain(
        'containerNumber',
      );
      // The tokens were spent: the model answered, the answer was unusable.
      expect(body.operations[0]).toMatchObject({ status: 'succeeded' });
      // No second AI call was made to decide that.
      expect(ai.callCount).toBe(1);
    });

    it('records an unknown failure code as unavailable rather than storing it', async () => {
      const { emailId } = await ingest();
      ai.reportsFailure('something_new', 'A newer AI service reported this.');

      const { body } = await analyze(emailId).expect(200);

      expect(body.status).toBe('failed');
      expect(body.failureCode).toBe('unavailable');
    });

    it('keeps the failure message free of email content', async () => {
      const { emailId } = await ingest();
      ai.reportsFailure('timeout', 'The provider did not respond within 60000ms.');

      const { body } = await analyze(emailId).expect(200);

      expect(body.failureMessage).not.toContain('MSCU7654321');
    });

    it('returns 503 and keeps the analysis reclaimable when the AI service is misconfigured', async () => {
      const { emailId } = await ingest();
      ai.failsTransport(
        'configuration',
        'No LLM provider is configured for the AI service. Set LLM_PROVIDER=openai and OPENAI_API_KEY.',
      );

      const response = await analyze(emailId).expect(503);

      expect(response.body.message).toMatch(/LLM_PROVIDER/);
      const rows = await dataSource.query(
        'SELECT status, failure_code FROM analyses WHERE email_id = $1',
        [emailId],
      );
      expect(rows[0].status).toBe('failed');
      expect(rows[0].failure_code).toBe('configuration');
    });

    it('records a transport timeout as a timeout failure', async () => {
      const { emailId } = await ingest();
      ai.failsTransport('timeout', 'The AI service did not respond within 90000ms.');

      const { body } = await analyze(emailId).expect(200);

      expect(body).toMatchObject({ status: 'failed', failureCode: 'timeout' });
    });

    it('records an off-contract response as invalid_response', async () => {
      const { emailId } = await ingest();
      ai.failsTransport(
        'invalid_response',
        'The AI service returned a response that did not match the agreed contract.',
      );

      const { body } = await analyze(emailId).expect(200);

      expect(body).toMatchObject({ status: 'failed', failureCode: 'invalid_response' });
    });
  });

  // --- repeated and concurrent requests ----------------------------------

  describe('repeated requests', () => {
    it('returns the stored result without calling the AI service again', async () => {
      const { emailId, analysisId } = await ingest();

      const first = await analyze(emailId).expect(200);
      const second = await analyze(emailId).expect(200);

      expect(first.body.id).toBe(analysisId);
      expect(second.body.id).toBe(analysisId);
      expect(second.body.status).toBe('completed');
      // The decisive assertion: no second round of token spend.
      expect(ai.callCount).toBe(1);
    });

    it('starts a new run after a failure, preserving the failed attempt', async () => {
      const { emailId, analysisId } = await ingest();
      ai.reportsFailure('timeout');
      await analyze(emailId).expect(200);

      ai.succeedsWith(VALID_EXTRACTION);
      const retry = await analyze(emailId).expect(200);

      expect(retry.body.id).not.toBe(analysisId);
      expect(retry.body.status).toBe('completed');

      const rows = await dataSource.query(
        'SELECT status FROM analyses WHERE email_id = $1 ORDER BY created_at',
        [emailId],
      );
      expect(rows.map((r: { status: string }) => r.status)).toEqual(['failed', 'completed']);
    });
  });

  describe('concurrency', () => {
    it('calls the AI service once when two requests arrive together', async () => {
      const { emailId } = await ingest();

      // Genuinely parallel, with no gate: whichever request loses the claim
      // either gets a conflict or is served the finished result, and which one
      // happens is a timing detail. The invariants below are not.
      const [a, b] = await Promise.all([startAnalyze(emailId), startAnalyze(emailId)]);

      expect([200, 409]).toContain(a.status);
      expect([200, 409]).toContain(b.status);

      // No double spend...
      expect(ai.callCount).toBe(1);
      // ...and no duplicate analysis record.
      const rows = await dataSource.query(
        'SELECT count(*)::int AS count FROM analyses WHERE email_id = $1',
        [emailId],
      );
      expect(rows[0].count).toBe(1);
    });

    it('enforces one unfinished analysis per email at the database level', async () => {
      const { emailId } = await ingest();

      // The pending row from ingestion already occupies the slot.
      await expect(
        dataSource.query("INSERT INTO analyses (email_id, status) VALUES ($1, 'processing')", [
          emailId,
        ]),
      ).rejects.toThrow();
    });

    it('reports a conflict rather than queueing a second run', async () => {
      const { emailId } = await ingest();
      const gate = ai.blocks();

      const first = startAnalyze(emailId);
      await new Promise((resolve) => setTimeout(resolve, 150));

      const conflict = await analyze(emailId).expect(409);
      expect(conflict.body.message).toMatch(/already in progress/i);

      gate.release();
      await expect(first).resolves.toMatchObject({ status: 200 });
    });
  });

  // --- missing email ------------------------------------------------------

  describe('missing email', () => {
    it('returns 404 and never calls the AI service', async () => {
      await analyze(UNKNOWN_ID).expect(404);
      expect(ai.callCount).toBe(0);
    });

    it('returns 400 for a malformed uuid', async () => {
      await analyze('not-a-uuid').expect(400);
      expect(ai.callCount).toBe(0);
    });
  });
});
