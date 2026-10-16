/**
 * Browser-visible configuration. Vite only exposes `VITE_`-prefixed variables,
 * so nothing secret can reach the bundle through this module.
 *
 * The API is called at its absolute URL in both development and production, so
 * there is one request path to reason about. The origin below must appear in
 * the API's `CORS_ORIGINS`.
 */
const rawBaseUrl = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:3000/api';

export const webEnv = {
  /** Base URL for the API, without a trailing slash. */
  apiBaseUrl: rawBaseUrl.replace(/\/$/, ''),
} as const;
