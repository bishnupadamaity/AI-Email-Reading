import { type INestApplication } from '@nestjs/common';
import request from 'supertest';
import { type DataSource } from 'typeorm';
import { loadApiConfig } from '../src/config/index.js';
import { createTestApp, type TestApp } from './support/test-app.js';
import { isPostgresReachable } from './support/test-database.js';

const EMAIL = {
  sender: 'dispatch@acme.example',
  subject: 'Shipment confirmation PO 9001',
  bodyText: 'Container MSCU9999999 departs Hamburg on 2026-04-01.',
  receivedAt: '2026-03-31T09:00:00.000Z',
};

/**
 * No AI service configured in the test environment, and no override: the real
 * `HttpAiServiceClient` is wired but `AI_SERVICE_ENABLED` is false, so the
 * runner refuses before claiming anything. This is the
 * deployment-misconfiguration path.
 */
describe('Analysis without an AI service configured (integration)', () => {
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

  it('confirms the test environment really has no AI service enabled', () => {
    const { aiService } = loadApiConfig();
    expect(aiService.enabled).toBe(false);
  });

  it('holds no provider credential or model name anywhere in its configuration', () => {
    // The whole point of the migration: the OpenAI key, the prompts and the
    // model routing live in `apps/ai-service`, not here.
    const config = loadApiConfig();
    const serialised = JSON.stringify(config);

    expect(serialised).not.toContain('sk-');
    expect(serialised).not.toContain('gpt-');
    expect(Object.keys(config)).not.toContain('llm');
    expect(Object.keys(config)).not.toContain('models');
  });

  it('defaults the AI service to a loopback address, never a public one', () => {
    const { aiService } = loadApiConfig();

    expect(aiService.baseUrl).toMatch(/^http:\/\/(127\.0\.0\.1|localhost)/);
  });

  it('fails the analysis request with a clear configuration error', async () => {
    const { body: email } = await request(app.getHttpServer())
      .post('/api/v1/emails')
      .send(EMAIL)
      .expect(201);

    const response = await request(app.getHttpServer())
      .post(`/api/v1/emails/${email.id}/analyze`)
      .expect(503);

    expect(response.body.statusCode).toBe(503);
    expect(response.body.message).toMatch(/AI service is not configured/i);
    // Actionable: it names the settings an operator has to supply, on both
    // sides of the boundary.
    expect(response.body.message).toMatch(/AI_SERVICE_ENABLED/);
    expect(response.body.message).toMatch(/AI_SERVICE_URL/);
    expect(response.body.message).toMatch(/LLM_PROVIDER/);
    expect(response.body.message).toMatch(/OPENAI_API_KEY/);
  });

  it('does not fabricate a result or consume the pending analysis', async () => {
    const { body: email } = await request(app.getHttpServer())
      .post('/api/v1/emails')
      .send(EMAIL)
      .expect(201);

    await request(app.getHttpServer()).post(`/api/v1/emails/${email.id}/analyze`).expect(503);

    const rows = await dataSource.query(
      'SELECT status, started_at, extracted_data, failure_code FROM analyses WHERE email_id = $1',
      [email.id],
    );

    expect(rows).toHaveLength(1);
    expect(rows[0].status).toBe('pending');
    expect(rows[0].started_at).toBeNull();
    expect(rows[0].extracted_data).toBeNull();
    expect(rows[0].failure_code).toBeNull();
  });

  it('never attempts to reach the AI service when it is disabled', async () => {
    // The guard runs before the client is used, so a disabled deployment makes
    // no outbound connection at all — the default URL points at a port with
    // nothing on it, and this still returns 503 rather than a transport error.
    const { body: email } = await request(app.getHttpServer())
      .post('/api/v1/emails')
      .send({ ...EMAIL, subject: 'Second message' })
      .expect(201);

    const response = await request(app.getHttpServer())
      .post(`/api/v1/emails/${email.id}/analyze`)
      .expect(503);

    expect(response.body.message).not.toMatch(/could not reach/i);
  });

  it('still serves the rest of the API', async () => {
    await request(app.getHttpServer()).get('/api/health').expect(200);
    await request(app.getHttpServer()).get('/api/v1/emails').expect(200);
  });
});
