import { useQuery } from '@tanstack/react-query';
import { apiClient, toApiError } from '../lib/api-client';
import { type HealthStatus } from '../types/health';

/** Polls the API liveness endpoint; used by the landing page to prove wiring. */
export function useHealth() {
  return useQuery({
    queryKey: ['health'],
    queryFn: async (): Promise<HealthStatus> => {
      try {
        const { data } = await apiClient.get<HealthStatus>('/health');
        return data;
      } catch (error) {
        throw toApiError(error);
      }
    },
    refetchInterval: 15_000,
  });
}
