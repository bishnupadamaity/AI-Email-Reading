/**
 * Runs before any application module is imported.
 *
 * `AppModule` composes its imports from configuration at import time, so the
 * test environment has to be in place first — assigning these inside
 * `beforeAll` would be too late.
 */
process.env['NODE_ENV'] = 'test';
process.env['DATABASE_ENABLED'] = 'false';
