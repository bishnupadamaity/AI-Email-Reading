import { type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AllExceptionsFilter } from '../src/common/index.js';
import { AppModule } from '../src/app.module.js';

/**
 * Boots the real application graph with persistence disabled (see
 * `test/setup-env.ts`), which keeps the suite runnable without Docker while
 * still exercising DI, routing, the global prefix and the exception filter.
 */
describe('Health (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();

    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api');
    app.useGlobalFilters(new AllExceptionsFilter());
    await app.init();
  });

  afterAll(async () => {
    await app?.close();
  });

  it('GET /api/health reports liveness', async () => {
    const response = await request(app.getHttpServer()).get('/api/health').expect(200);

    expect(response.body).toMatchObject({ status: 'ok', service: 'email-ai-api' });
    expect(typeof response.body.uptimeSeconds).toBe('number');
  });

  it('GET /api/health/ready reports the database as disabled', async () => {
    const response = await request(app.getHttpServer()).get('/api/health/ready').expect(200);

    expect(response.body).toMatchObject({
      status: 'ok',
      dependencies: { database: 'disabled' },
    });
  });

  it('returns the shared error shape for an unknown route', async () => {
    const response = await request(app.getHttpServer()).get('/api/does-not-exist').expect(404);

    expect(response.body).toMatchObject({ statusCode: 404 });
    expect(typeof response.body.message).toBe('string');
  });
});
