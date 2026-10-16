/**
 * Integration suite: requires PostgreSQL (`pnpm infra:up`).
 *
 * Kept separate from `jest.config.mjs` so `pnpm test` stays runnable with no
 * infrastructure, while these specs can fail loudly when the database they
 * genuinely need is missing.
 *
 * @type {import('jest').Config}
 */
export default {
  testEnvironment: 'node',
  rootDir: '.',
  roots: ['<rootDir>/test'],
  testRegex: '.*\\.int-spec\\.ts$',
  setupFiles: ['<rootDir>/test/setup-integration-env.ts'],
  extensionsToTreatAsEsm: ['.ts'],
  transform: {
    '^.+\\.ts$': ['ts-jest', { useESM: true, tsconfig: '<rootDir>/tsconfig.json' }],
  },
  moduleNameMapper: {
    '^(\\.{1,2}/.*)\\.js$': '$1',
  },
  moduleFileExtensions: ['ts', 'js', 'json'],
  // Schema creation plus HTTP round-trips; the default 5s is too tight.
  testTimeout: 30_000,
};
