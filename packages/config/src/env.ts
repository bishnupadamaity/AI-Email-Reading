import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { config as loadDotenv } from 'dotenv';
import type { z } from 'zod';

export interface LoadEnvOptions {
  /** Explicit path to a dotenv file. Takes precedence over discovery. */
  envFilePath?: string;
  /** Directory to start searching upwards from. Defaults to `process.cwd()`. */
  cwd?: string;
  /** Skip dotenv entirely and read `process.env` as-is (useful in containers). */
  skipDotenv?: boolean;
  /** Raw source of values. Defaults to `process.env`. */
  source?: NodeJS.ProcessEnv;
  /** Name used in error messages, e.g. `"api"`. */
  appName?: string;
}

/** Thrown when the environment does not satisfy an application's schema. */
export class EnvValidationError extends Error {
  constructor(
    message: string,
    readonly issues: readonly z.core.$ZodIssue[],
  ) {
    super(message);
    this.name = 'EnvValidationError';
  }
}

const MAX_UPWARD_LEVELS = 6;

/**
 * Walks up from `startDir` looking for a dotenv file. In a monorepo the file
 * normally lives at the repository root while processes start inside `apps/*`.
 */
export function findEnvFile(startDir: string = process.cwd(), fileName = '.env'): string | null {
  let current = resolve(startDir);

  for (let level = 0; level <= MAX_UPWARD_LEVELS; level += 1) {
    const candidate = resolve(current, fileName);
    if (existsSync(candidate)) return candidate;

    const parent = dirname(current);
    if (parent === current) break;
    current = parent;
  }

  return null;
}

/**
 * Loads (optionally) a dotenv file and validates the result against `schema`.
 *
 * Existing `process.env` values always win over the dotenv file, so container
 * and CI configuration cannot be silently overridden by a stray local file.
 */
export function loadEnv<Schema extends z.ZodType>(
  schema: Schema,
  options: LoadEnvOptions = {},
): z.infer<Schema> {
  const { envFilePath, cwd, skipDotenv = false, source = process.env, appName } = options;

  if (!skipDotenv) {
    const path = envFilePath ?? findEnvFile(cwd);
    if (path) loadDotenv({ path, override: false, quiet: true });
  }

  const result = schema.safeParse(source);
  if (result.success) return result.data;

  const label = appName ? `${appName}: ` : '';
  const details = result.error.issues
    .map((issue) => `  - ${issue.path.join('.') || '(root)'}: ${issue.message}`)
    .join('\n');

  throw new EnvValidationError(
    `${label}invalid environment configuration:\n${details}`,
    result.error.issues,
  );
}
