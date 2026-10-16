import { type INestApplication } from '@nestjs/common';
import request from 'supertest';
import { type DataSource } from 'typeorm';
import { createTestApp, type TestApp } from './support/test-app.js';
import { isPostgresReachable } from './support/test-database.js';

const VALID_EMAIL = {
  sender: 'dispatch@acme.example',
  subject: 'Shipment confirmation PO 2002',
  bodyText: 'Container MSCU2222222 departs Hamburg on 2026-03-05.',
  receivedAt: '2026-03-04T09:00:00.000Z',
};

const UNKNOWN_ID = '22222222-2222-4222-8222-222222222222';

describe('Analyses (integration)', () => {
  let harness: TestApp;
  let app: INestApplication;
  let dataSource: DataSource;

  beforeAll(async () => {
    if (!(await isPostgresReachable())) {
      throw new Error(
        'PostgreSQL is not reachable. Start it with `pnpm infra:up` before running the integration suite.',
      );
    }

    harness = await createTestApp();
    app = harness.app;
    dataSource = harness.dataSource;
  });

  afterAll(async () => {
    await harness?.close();
  });

  beforeEach(async () => {
    await harness.reset();
  });

  /** Ingests an email and returns the ids of the email and its analysis. */
  async function ingest(): Promise<{ emailId: string; analysisId: string }> {
    const { body } = await request(app.getHttpServer())
      .post('/api/v1/emails')
      .send(VALID_EMAIL)
      .expect(201);

    return { emailId: body.id, analysisId: body.latestAnalysis.id };
  }

  describe('creating an analysis alongside an email', () => {
    it('attaches exactly one pending analysis to the new email', async () => {
      const { emailId } = await ingest();

      const rows = await dataSource.query(
        'SELECT id, status, extracted_data, validation_errors, model_name, started_at, completed_at FROM analyses WHERE email_id = $1',
        [emailId],
      );

      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({
        status: 'pending',
        extracted_data: null,
        validation_errors: null,
        model_name: null,
        started_at: null,
        completed_at: null,
      });
    });

    it('links the analysis back to its email', async () => {
      const { emailId, analysisId } = await ingest();

      const response = await request(app.getHttpServer())
        .get(`/api/v1/analyses/${analysisId}`)
        .expect(200);

      expect(response.body.emailId).toBe(emailId);
    });

    it('refuses an analysis for an email that does not exist', async () => {
      // Guards the foreign key, not the API: there is no endpoint for this.
      await expect(
        dataSource.query('INSERT INTO analyses (email_id) VALUES ($1)', [UNKNOWN_ID]),
      ).rejects.toThrow();
    });
  });

  describe('GET /api/v1/analyses/:id', () => {
    it('returns the full analysis contract', async () => {
      const { emailId, analysisId } = await ingest();

      const response = await request(app.getHttpServer())
        .get(`/api/v1/analyses/${analysisId}`)
        .expect(200);

      expect(response.body).toMatchObject({
        id: analysisId,
        emailId,
        status: 'pending',
        extractedData: null,
        validationErrors: null,
        modelName: null,
        startedAt: null,
        completedAt: null,
      });
      expect(typeof response.body.createdAt).toBe('string');
      expect(typeof response.body.updatedAt).toBe('string');
    });

    it('returns 404 for an unknown id', async () => {
      const response = await request(app.getHttpServer())
        .get(`/api/v1/analyses/${UNKNOWN_ID}`)
        .expect(404);

      expect(response.body).toMatchObject({ statusCode: 404 });
    });

    it('returns 400 for a malformed uuid', async () => {
      await request(app.getHttpServer()).get('/api/v1/analyses/not-a-uuid').expect(400);
    });

    it('does not leak database internals on a failed lookup', async () => {
      const response = await request(app.getHttpServer())
        .get(`/api/v1/analyses/${UNKNOWN_ID}`)
        .expect(404);

      const serialised = JSON.stringify(response.body);
      expect(serialised).not.toMatch(/select|from "analyses"|QueryFailedError|at /i);
    });
  });
});
