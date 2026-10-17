import { AxiosError } from 'axios';
import { apiClient, toApiError } from '../api-client';

/** Response of `GET /health`, mirrored from the API's health controller. */
export interface HealthLiveness {
  status: 'ok';
  service: string;
  version: string;
  uptimeSeconds: number;
  timestamp: string;
}

export type DependencyStatus = 'up' | 'down' | 'disabled';

/** Response of `GET /health/ready`. Answers `503` when a dependency is down. */
export interface HealthReadiness {
  status: 'ok' | 'error';
  dependencies: Record<string, DependencyStatus>;
  timestamp: string;
}

export async function fetchLiveness(): Promise<HealthLiveness> {
  try {
    const { data } = await apiClient.get<HealthLiveness>('/health');
    return data;
  } catch (error) {
    throw toApiError(error);
  }
}

function isReadinessBody(value: unknown): value is HealthReadiness {
  return typeof value === 'object' && value !== null && 'dependencies' in value;
}

/**
 * Readiness answers `503` with the same body shape when a dependency is
 * unreachable (the exception filter passes object bodies through unchanged), so
 * that body is the result rather than a transport failure.
 */
export async function fetchReadiness(): Promise<HealthReadiness> {
  try {
    const { data } = await apiClient.get<HealthReadiness>('/health/ready');
    return data;
  } catch (error) {
    if (error instanceof AxiosError && error.response?.status === 503) {
      const body: unknown = error.response.data;
      if (isReadinessBody(body)) return { ...body, status: 'error' };
    }
    throw toApiError(error);
  }
}
