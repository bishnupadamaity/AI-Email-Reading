import { type ApiError } from '@email-ai/contracts';
import axios, { AxiosError } from 'axios';
import { webEnv } from './env';

/**
 * The single HTTP entry point to the API. Every feature goes through this
 * instance so base URL, timeout and error normalisation stay in one place.
 *
 * The browser never talks to an LLM provider — all AI work happens behind the
 * API and the worker.
 */
export const apiClient = axios.create({
  baseURL: webEnv.apiBaseUrl,
  timeout: 15_000,
  headers: { 'Content-Type': 'application/json' },
});

/**
 * Analysis is synchronous and bounded by the AI service's model timeout, so it
 * needs a deadline well above the default one.
 */
export const ANALYZE_TIMEOUT_MS = 180_000;

/** Turns any Axios failure into the shared `ApiError` shape. */
export function toApiError(error: unknown): ApiError {
  if (error instanceof AxiosError) {
    const body = error.response?.data as Partial<ApiError> | undefined;
    return {
      statusCode: error.response?.status ?? 0,
      message: body?.message ?? error.message,
      ...(body?.error ? { error: body.error } : {}),
      ...(body?.details ? { details: body.details } : {}),
    };
  }

  return { statusCode: 0, message: error instanceof Error ? error.message : 'Unknown error' };
}

function isApiError(value: unknown): value is ApiError {
  return (
    typeof value === 'object' &&
    value !== null &&
    'statusCode' in value &&
    typeof (value as ApiError).statusCode === 'number'
  );
}

/** `ApiError` for anything thrown by a query function in this app. */
export function asApiError(error: unknown): ApiError {
  return isApiError(error) ? error : toApiError(error);
}

/**
 * Operator-facing explanation of a failed request. Status 0 means the request
 * never reached the API, which in development almost always means it is not
 * running — worth saying rather than showing "Network Error".
 */
export function describeApiError(error: unknown): string {
  const apiError = asApiError(error);

  if (apiError.statusCode === 0) {
    return `Could not reach the API at ${webEnv.apiBaseUrl}. Start it with \`pnpm dev:api\` and check CORS_ORIGINS includes this origin.`;
  }

  if (apiError.details?.length) {
    const problems = apiError.details.map((d) => `${d.path}: ${d.message}`).join('; ');
    return `${apiError.message} (${problems})`;
  }

  return apiError.message;
}

/** A connection failure rather than a response the API chose to send. */
export function isOffline(error: unknown): boolean {
  return asApiError(error).statusCode === 0;
}
