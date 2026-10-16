import { type INestApplication } from '@nestjs/common';
import { Test, type TestingModuleBuilder } from '@nestjs/testing';
import { getDataSourceToken } from '@nestjs/typeorm';
import { type DataSource } from 'typeorm';
import { AppModule } from '../../src/app.module.js';
import { applyApiConventions } from '../../src/common/index.js';
import { ensureTestDatabase } from './test-database.js';

export interface TestApp {
  app: INestApplication;
  dataSource: DataSource;
  /** Empties the feature tables. Scoped to the test database only. */
  reset(): Promise<void>;
  close(): Promise<void>;
}

/**
 * Boots the real `AppModule` against the test database and applies the same
 * HTTP conventions as `main.ts`, so paths, versioning and error shapes under
 * test are the ones production serves.
 *
 * Migrations are executed here rather than relying on synchronisation, which
 * also makes the migration itself part of what the suite verifies.
 */
export async function createTestApp(
  /** Hook for replacing providers, e.g. the LLM boundary. */
  customize?: (builder: TestingModuleBuilder) => TestingModuleBuilder,
): Promise<TestApp> {
  await ensureTestDatabase();

  const base = Test.createTestingModule({ imports: [AppModule] });
  const moduleRef = await (customize ? customize(base) : base).compile();
  const app = moduleRef.createNestApplication({ logger: false });

  applyApiConventions(app, 'api');
  await app.init();

  const dataSource = app.get<DataSource>(getDataSourceToken());
  await dataSource.runMigrations({ transaction: 'all' });

  return {
    app,
    dataSource,
    async reset() {
      await dataSource.query('TRUNCATE TABLE "analyses", "emails" CASCADE');
    },
    async close() {
      await app.close();
    },
  };
}
