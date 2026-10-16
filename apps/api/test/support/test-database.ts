import { Client } from 'pg';

/**
 * Name of the database the integration suite uses. Separate from the
 * development database so tests can truncate freely without destroying
 * whatever the developer has seeded.
 */
export const TEST_DATABASE = process.env['POSTGRES_DB'] ?? 'email_ai_test';

function adminConnection() {
  return {
    host: process.env['POSTGRES_HOST'] ?? 'localhost',
    port: Number(process.env['POSTGRES_PORT'] ?? 5432),
    user: process.env['POSTGRES_USER'] ?? 'email_ai',
    password: process.env['POSTGRES_PASSWORD'] ?? 'email_ai_local_password',
    // Maintenance database: CREATE DATABASE cannot run from inside the target.
    database: 'postgres',
  };
}

/**
 * Creates the test database if it does not exist. Never drops it — the suite
 * truncates tables instead, so a stray failure cannot destroy anything.
 */
export async function ensureTestDatabase(): Promise<void> {
  const client = new Client(adminConnection());
  await client.connect();

  try {
    const existing = await client.query('SELECT 1 FROM pg_database WHERE datname = $1', [
      TEST_DATABASE,
    ]);

    if (existing.rowCount === 0) {
      try {
        // Identifier cannot be parameterised; the value comes from our own env.
        await client.query(`CREATE DATABASE "${TEST_DATABASE}"`);
      } catch (error: unknown) {
        // Jest runs spec files in parallel workers, so check-then-create is
        // racy: another worker may have won. Either error below means the
        // database now exists, which is all this function promises.
        const code = (error as { code?: string }).code;
        const alreadyExists = code === '42P04' || code === '23505';
        if (!alreadyExists) throw error;
      }
    }
  } finally {
    await client.end();
  }
}

/** True when PostgreSQL is reachable, so the suite can report a clear skip. */
export async function isPostgresReachable(): Promise<boolean> {
  const client = new Client({ ...adminConnection(), connectionTimeoutMillis: 2_000 });
  try {
    await client.connect();
    await client.end();
    return true;
  } catch {
    return false;
  }
}
