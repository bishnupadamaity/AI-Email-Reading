import { useQuery } from '@tanstack/react-query';
import { fetchLiveness, fetchReadiness } from '../lib/api/health';

/** Polls the API liveness endpoint. */
export function useHealth() {
  return useQuery({
    queryKey: ['health'],
    queryFn: fetchLiveness,
    refetchInterval: 30_000,
  });
}

/** Dependency readiness. Reports `up`, `down` or `disabled` per dependency. */
export function useReadiness() {
  return useQuery({
    queryKey: ['health', 'ready'],
    queryFn: fetchReadiness,
    refetchInterval: 30_000,
  });
}
