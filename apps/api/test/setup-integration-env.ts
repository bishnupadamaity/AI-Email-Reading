/**
 * Runs before any application module is imported.
 *
 * `AppModule` composes its imports from configuration at import time, so the
 * test database has to be selected here rather than inside `beforeAll`.
 *
 * The database name is suffixed with the Jest worker id: spec files run in
 * parallel workers, and sharing one database would mean one worker truncating
 * another's rows mid-test.
 */
const base = process.env['POSTGRES_TEST_DB'] ?? 'email_ai_test';
const worker = process.env['JEST_WORKER_ID'] ?? '1';

process.env['NODE_ENV'] = 'test';
process.env['DATABASE_ENABLED'] = 'true';
process.env['POSTGRES_DB'] = `${base}_${worker}`;
