import { type INestApplication } from '@nestjs/common';
import request from 'supertest';
import { type DataSource } from 'typeorm';
import { createTestApp, type TestApp } from './support/test-app.js';
import { isPostgresReachable } from './support/test-database.js';

const VALID_PAYLOAD = {
  externalMessageId: '<po-1001@acme.example>',
  sender: 'Acme Logistics <dispatch@acme.example>',
  subject: 'Shipment confirmation PO 1001',
  bodyText: 'Container MSCU1111111 departs Rotterdam on 2026-02-02.',
  receivedAt: '2026-02-01T09:30:00.000Z',
};

const UNKNOWN_ID = '11111111-1111-4111-8111-111111111111';

describe('Emails (integration)', () => {
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

  // --- migration behaviour ------------------------------------------------

  describe('migrations', () => {
    it('leaves no pending migrations after running', async () => {
      await expect(dataSource.showMigrations()).resolves.toBe(false);
    });

    it('creates the partial unique index that scopes de-duplication', async () => {
      const rows: { indexdef: string }[] = await dataSource.query(
        `SELECT indexdef FROM pg_indexes WHERE indexname = 'uq_emails_account_external_message_id'`,
      );

      expect(rows).toHaveLength(1);
      // NULLS NOT DISTINCT is what makes de-duplication work while every
      // email_account_id is still NULL.
      expect(rows[0]?.indexdef).toContain('NULLS NOT DISTINCT');
      expect(rows[0]?.indexdef).toContain('external_message_id IS NOT NULL');
    });

    it('cascades the delete from emails to analyses', async () => {
      const rows: { confdeltype: string }[] = await dataSource.query(
        `SELECT confdeltype FROM pg_constraint WHERE conname = 'fk_analyses_email'`,
      );

      expect(rows[0]?.confdeltype).toBe('c');
    });
  });

  // --- creation -----------------------------------------------------------

  describe('POST /api/v1/emails', () => {
    it('creates an email and returns it with a pending analysis', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/v1/emails')
        .send(VALID_PAYLOAD)
        .expect(201);

      expect(response.body).toMatchObject({
        sender: VALID_PAYLOAD.sender,
        subject: VALID_PAYLOAD.subject,
        bodyText: VALID_PAYLOAD.bodyText,
        receivedAt: VALID_PAYLOAD.receivedAt,
        processingStatus: 'received',
        emailAccountId: null,
      });
      expect(response.body.id).toMatch(/^[0-9a-f-]{36}$/);
      expect(response.body.latestAnalysis).toMatchObject({ status: 'pending' });
    });

    it('persists the row and its analysis in the database', async () => {
      const { body } = await request(app.getHttpServer())
        .post('/api/v1/emails')
        .send(VALID_PAYLOAD)
        .expect(201);

      const emails = await dataSource.query('SELECT id, subject FROM emails WHERE id = $1', [
        body.id,
      ]);
      const analyses = await dataSource.query(
        'SELECT id, status FROM analyses WHERE email_id = $1',
        [body.id],
      );

      expect(emails).toHaveLength(1);
      expect(analyses).toHaveLength(1);
      expect(analyses[0].status).toBe('pending');
    });

    it('accepts a payload without the optional identifiers', async () => {
      const { externalMessageId: _omitted, ...minimal } = VALID_PAYLOAD;

      const response = await request(app.getHttpServer())
        .post('/api/v1/emails')
        .send(minimal)
        .expect(201);

      expect(response.body.externalMessageId).toBeNull();
    });

    it('rolls the analysis back when the email insert is rejected', async () => {
      await request(app.getHttpServer()).post('/api/v1/emails').send(VALID_PAYLOAD).expect(201);
      await request(app.getHttpServer()).post('/api/v1/emails').send(VALID_PAYLOAD).expect(409);

      // The rejected attempt must not have left a stray analysis behind.
      const [{ count }] = await dataSource.query('SELECT count(*)::int AS count FROM analyses');
      expect(count).toBe(1);
    });

    it('rejects a duplicate externalMessageId with 409', async () => {
      await request(app.getHttpServer()).post('/api/v1/emails').send(VALID_PAYLOAD).expect(201);

      const response = await request(app.getHttpServer())
        .post('/api/v1/emails')
        .send(VALID_PAYLOAD)
        .expect(409);

      expect(response.body).toMatchObject({ statusCode: 409 });
      expect(response.body.message).not.toMatch(/constraint|index|relation/i);
    });

    it('allows the same externalMessageId on a different email account', async () => {
      await request(app.getHttpServer()).post('/api/v1/emails').send(VALID_PAYLOAD).expect(201);

      await request(app.getHttpServer())
        .post('/api/v1/emails')
        .send({ ...VALID_PAYLOAD, emailAccountId: UNKNOWN_ID })
        .expect(201);
    });
  });

  // --- invalid payloads ---------------------------------------------------

  describe('POST /api/v1/emails validation', () => {
    const cases: [string, Record<string, unknown>, string][] = [
      ['a missing body', { ...VALID_PAYLOAD, bodyText: undefined }, 'bodyText'],
      ['a missing sender', { ...VALID_PAYLOAD, sender: undefined }, 'sender'],
      ['a non-ISO receivedAt', { ...VALID_PAYLOAD, receivedAt: '15/01/2026' }, 'receivedAt'],
      [
        'a malformed emailAccountId',
        { ...VALID_PAYLOAD, emailAccountId: 'nope' },
        'emailAccountId',
      ],
      ['an over-long subject', { ...VALID_PAYLOAD, subject: 'x'.repeat(999) }, 'subject'],
    ];

    it.each(cases)('rejects %s with 400 naming the field', async (_label, payload, field) => {
      const response = await request(app.getHttpServer())
        .post('/api/v1/emails')
        .send(payload)
        .expect(400);

      expect(response.body).toMatchObject({ statusCode: 400, message: 'Validation failed' });
      expect(response.body.details.map((d: { path: string }) => d.path)).toContain(field);
    });

    it('rejects an entirely empty body and reports every problem at once', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/v1/emails')
        .send({})
        .expect(400);

      expect(response.body.details.length).toBeGreaterThanOrEqual(4);
    });

    it('writes nothing when validation fails', async () => {
      await request(app.getHttpServer()).post('/api/v1/emails').send({}).expect(400);

      const [{ count }] = await dataSource.query('SELECT count(*)::int AS count FROM emails');
      expect(count).toBe(0);
    });
  });

  // --- retrieval ----------------------------------------------------------

  describe('GET /api/v1/emails/:id', () => {
    it('returns an existing email with its body and analysis', async () => {
      const { body: created } = await request(app.getHttpServer())
        .post('/api/v1/emails')
        .send(VALID_PAYLOAD)
        .expect(201);

      const response = await request(app.getHttpServer())
        .get(`/api/v1/emails/${created.id}`)
        .expect(200);

      expect(response.body).toMatchObject({
        id: created.id,
        bodyText: VALID_PAYLOAD.bodyText,
      });
      expect(response.body.latestAnalysis.id).toBe(created.latestAnalysis.id);
    });

    it('returns 404 for an unknown id', async () => {
      const response = await request(app.getHttpServer())
        .get(`/api/v1/emails/${UNKNOWN_ID}`)
        .expect(404);

      expect(response.body).toMatchObject({ statusCode: 404 });
    });

    it('returns 400 for a malformed uuid', async () => {
      await request(app.getHttpServer()).get('/api/v1/emails/not-a-uuid').expect(400);
    });
  });

  // --- pagination ---------------------------------------------------------

  describe('GET /api/v1/emails', () => {
    /** Three emails, deliberately out of chronological order of insertion. */
    async function seedThree(): Promise<void> {
      const days = [
        '2026-02-03T00:00:00.000Z',
        '2026-02-01T00:00:00.000Z',
        '2026-02-02T00:00:00.000Z',
      ];

      for (const [index, receivedAt] of days.entries()) {
        await request(app.getHttpServer())
          .post('/api/v1/emails')
          .send({
            ...VALID_PAYLOAD,
            externalMessageId: `<page-${index}@acme.example>`,
            subject: `Email ${receivedAt}`,
            receivedAt,
          })
          .expect(201);
      }
    }

    it('applies the default page and pageSize', async () => {
      await seedThree();

      const response = await request(app.getHttpServer()).get('/api/v1/emails').expect(200);

      expect(response.body).toMatchObject({ page: 1, pageSize: 25, total: 3 });
      expect(response.body.items).toHaveLength(3);
    });

    it('orders by receivedAt descending', async () => {
      await seedThree();

      const { body } = await request(app.getHttpServer()).get('/api/v1/emails').expect(200);
      const dates = body.items.map((item: { receivedAt: string }) => item.receivedAt);

      expect(dates).toEqual([...dates].sort().reverse());
    });

    it('splits results across pages without overlap or gaps', async () => {
      await seedThree();

      const first = await request(app.getHttpServer())
        .get('/api/v1/emails?page=1&pageSize=2')
        .expect(200);
      const second = await request(app.getHttpServer())
        .get('/api/v1/emails?page=2&pageSize=2')
        .expect(200);

      expect(first.body.items).toHaveLength(2);
      expect(second.body.items).toHaveLength(1);
      expect(first.body.total).toBe(3);

      const ids = [...first.body.items, ...second.body.items].map((i: { id: string }) => i.id);
      expect(new Set(ids).size).toBe(3);
    });

    it('returns an empty page beyond the end of the collection', async () => {
      await seedThree();

      const response = await request(app.getHttpServer())
        .get('/api/v1/emails?page=99&pageSize=25')
        .expect(200);

      expect(response.body).toMatchObject({ items: [], total: 3 });
    });

    it('omits the body from list items', async () => {
      await seedThree();

      const { body } = await request(app.getHttpServer()).get('/api/v1/emails').expect(200);

      expect(body.items[0]).not.toHaveProperty('bodyText');
    });

    it.each([
      ['page=0', 'page'],
      ['pageSize=0', 'pageSize'],
      ['pageSize=101', 'pageSize'],
      ['page=abc', 'page'],
    ])('rejects %s with 400', async (query, field) => {
      const response = await request(app.getHttpServer())
        .get(`/api/v1/emails?${query}`)
        .expect(400);

      expect(response.body.details.map((d: { path: string }) => d.path)).toContain(field);
    });
  });
});
