import { type AnalysisDetail, type EmailDetail, type EmailSummary } from '@email-ai/contracts';
import { useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { fetchAnalysis } from '../lib/api/analyses';
import { fetchEmail, fetchEmails } from '../lib/api/emails';
import { demoAnalyses, demoEmails } from '../lib/demo/demo-data';
import { useDemoMode } from '../lib/demo/demo-mode-context';
import { queryKeys } from './use-emails';

export interface WorkspaceRecord {
  email: EmailDetail;
  /** `null` when the email has no analysis row, which ingestion never leaves. */
  analysis: AnalysisDetail | null;
}

export interface WorkspaceScan {
  records: readonly WorkspaceRecord[];
  /** Server-reported total number of emails, from the list envelope. */
  total: number;
  /** How many emails were fully loaded (detail plus latest analysis). */
  scanned: number;
  /** Emails whose detail or analysis could not be read. */
  failed: number;
  /** Requests this scan cost, shown so the price of a deeper scan is visible. */
  requestCount: number;
  demo: boolean;
}

/** Keeps the browser's per-host connection limit from being swamped. */
const CONCURRENCY = 6;

async function mapWithConcurrency<In, Out>(
  items: readonly In[],
  limit: number,
  task: (item: In) => Promise<Out>,
): Promise<Out[]> {
  const results: Out[] = new Array(items.length);
  let cursor = 0;

  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor++;
      results[index] = await task(items[index]!);
    }
  });

  await Promise.all(workers);
  return results;
}

/**
 * Loads emails together with their latest analysis.
 *
 * This exists because the API has no aggregate endpoint and its list
 * projection carries no analysis reference: deriving review work, conflicts or
 * missing information means reading `GET /v1/emails/:id` and then
 * `GET /v1/analyses/:id` for each email. That is two requests per email, which
 * is why the scan is bounded and why every page built on it says so.
 *
 * Fetched records are written into the individual query caches, so opening an
 * email from a derived page does not refetch it.
 */
async function scanWorkspace(
  limit: number,
  queryClient: QueryClient,
  signal: AbortSignal,
): Promise<WorkspaceScan> {
  const pageSize = Math.min(100, limit);
  let requestCount = 1;

  const firstPage = await fetchEmails({ page: 1, pageSize });
  const summaries: EmailSummary[] = [...firstPage.items];

  while (summaries.length < limit && summaries.length < firstPage.total && !signal.aborted) {
    const page = Math.floor(summaries.length / pageSize) + 1;
    requestCount += 1;
    const next = await fetchEmails({ page, pageSize });
    if (next.items.length === 0) break;
    summaries.push(...next.items);
  }

  const wanted = summaries.slice(0, limit);
  let failed = 0;

  const loaded = await mapWithConcurrency(wanted, CONCURRENCY, async (summary) => {
    try {
      requestCount += 1;
      const email = await fetchEmail(summary.id);
      queryClient.setQueryData(queryKeys.email(email.id, false), email);

      let analysis: AnalysisDetail | null = null;
      if (email.latestAnalysis) {
        requestCount += 1;
        analysis = await fetchAnalysis(email.latestAnalysis.id);
        queryClient.setQueryData(queryKeys.analysis(analysis.id, false), analysis);
      }

      return { email, analysis } satisfies WorkspaceRecord;
    } catch {
      // One unreadable email must not discard the rest of the scan.
      failed += 1;
      return null;
    }
  });

  const records = loaded.filter((record): record is WorkspaceRecord => record !== null);

  return {
    records,
    total: firstPage.total,
    scanned: records.length,
    failed,
    requestCount,
    demo: false,
  };
}

function demoScan(limit: number): WorkspaceScan {
  const records = demoEmails.slice(0, limit).map((email) => ({
    email,
    analysis: demoAnalyses.find((analysis) => analysis.emailId === email.id) ?? null,
  }));

  return {
    records,
    total: demoEmails.length,
    scanned: records.length,
    failed: 0,
    requestCount: 0,
    demo: true,
  };
}

export const DEFAULT_SCAN_LIMIT = 25;
export const SCAN_LIMITS = [25, 50, 100] as const;

export function useWorkspaceScan(limit: number = DEFAULT_SCAN_LIMIT) {
  const queryClient = useQueryClient();
  const { enabled: demo } = useDemoMode();

  return useQuery({
    queryKey: queryKeys.scan(limit, demo),
    // The scan is expensive, so it is not refetched on every mount.
    staleTime: 60_000,
    queryFn: ({ signal }) => (demo ? demoScan(limit) : scanWorkspace(limit, queryClient, signal)),
  });
}
