import { skipToken, useQuery } from '@tanstack/react-query';
import { useDemoMode } from '../lib/demo/demo-mode-context';
import { summarize, type WorkspaceSummary } from '../lib/workspace';
import { queryKeys } from './use-emails';
import { DEFAULT_SCAN_LIMIT, type WorkspaceScan } from './use-workspace-scan';

/**
 * Reads an already-cached workspace scan without starting one.
 *
 * The sidebar badges must not cost 2N requests on every page: `skipToken`
 * subscribes to the cache entry but never fetches it, so counts appear once a
 * page that genuinely needs the scan has loaded it, and stay blank otherwise.
 */
export function useCachedScanSummary(): WorkspaceSummary | null {
  const { enabled: demo } = useDemoMode();

  const { data } = useQuery<WorkspaceScan>({
    queryKey: queryKeys.scan(DEFAULT_SCAN_LIMIT, demo),
    queryFn: skipToken,
  });

  return data ? summarize(data.records, data.total) : null;
}
