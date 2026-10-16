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

/** Turns any Axios failure into the shared `ApiError` shape. */
export function toApiError(error: unknown): ApiError {
  if (error instanceof AxiosError) {
    const body = error.response?.data as Partial<ApiError> | undefined;
    return {
      statusCode: error.response?.status ?? 0,
      message: body?.message ?? error.message,
      ...(body?.error ? { error: body.error } : {}),
    };
  }

  return { statusCode: 0, message: error instanceof Error ? error.message : 'Unknown error' };
}
