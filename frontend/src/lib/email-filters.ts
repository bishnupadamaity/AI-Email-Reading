import { type EmailClassification } from '@email-ai/contracts';
import { type WorkspaceRecord } from '../hooks/use-workspace-scan';
import { deriveReviewSignals, needsReview, readFields } from './extraction';

/**
 * Client-side search, filtering and sorting.
 *
 * `GET /v1/emails` accepts only `page` and `pageSize`, so none of this can be
 * pushed to the server. Everything here operates on the records a scan has
 * already loaded, and the UI states that plainly — a filter that silently
 * applied to one page of a larger table would be a lie about the result set.
 */

export type StatusFilter =
  'all' | 'unprocessed' | 'processing' | 'completed' | 'needs_review' | 'failed';

export type FlagFilter = 'any' | 'conflicts' | 'missing' | 'clean';

export type SortKey = 'receivedAt' | 'sender' | 'subject' | 'status';

export interface EmailFilters {
  term: string;
  status: StatusFilter;
  sender: string;
  classification: string;
  flag: FlagFilter;
  /** Inclusive lower bound on `receivedAt`, as `YYYY-MM-DD`. */
  from: string;
  to: string;
}

export const emptyFilters: EmailFilters = {
  term: '',
  status: 'all',
  sender: 'all',
  classification: 'all',
  flag: 'any',
  from: '',
  to: '',
};

export function hasActiveFilters(filters: EmailFilters): boolean {
  return (
    filters.term.trim() !== '' ||
    filters.status !== 'all' ||
    filters.sender !== 'all' ||
    filters.classification !== 'all' ||
    filters.flag !== 'any' ||
    filters.from !== '' ||
    filters.to !== ''
  );
}

/** Haystack for free-text search: headers, body and every extracted value. */
function searchableText(record: WorkspaceRecord): string {
  const parts = [record.email.sender, record.email.subject, record.email.bodyText];
  const extraction = record.analysis?.extractedData;

  if (extraction) {
    parts.push(extraction.summary, extraction.classification);
    for (const field of readFields(extraction)) {
      if (field.value) parts.push(field.value);
      if (field.conflict) parts.push(...field.conflict.values);
    }
  }

  return parts.join('\n').toLowerCase();
}

export function matchesStatus(record: WorkspaceRecord, status: StatusFilter): boolean {
  const analysisStatus = record.analysis?.status;

  switch (status) {
    case 'all':
      return true;
    case 'unprocessed':
      return analysisStatus === 'pending' || analysisStatus === undefined;
    case 'processing':
      return analysisStatus === 'processing';
    case 'completed':
      return analysisStatus === 'completed';
    case 'failed':
      return analysisStatus === 'failed';
    case 'needs_review':
      return needsReview(deriveReviewSignals(record.analysis ?? null));
  }
}

function matchesFlag(record: WorkspaceRecord, flag: FlagFilter): boolean {
  const extraction = record.analysis?.extractedData;

  switch (flag) {
    case 'any':
      return true;
    case 'conflicts':
      return (extraction?.conflicts.length ?? 0) > 0;
    case 'missing':
      return (extraction?.missingFields.length ?? 0) > 0;
    case 'clean':
      return (
        extraction != null &&
        extraction.conflicts.length === 0 &&
        extraction.missingFields.length === 0
      );
  }
}

export function filterRecords(
  records: readonly WorkspaceRecord[],
  filters: EmailFilters,
): WorkspaceRecord[] {
  const term = filters.term.trim().toLowerCase();
  const fromTime = filters.from ? new Date(`${filters.from}T00:00:00`).getTime() : null;
  const toTime = filters.to ? new Date(`${filters.to}T23:59:59.999`).getTime() : null;

  return records.filter((record) => {
    if (!matchesStatus(record, filters.status)) return false;
    if (!matchesFlag(record, filters.flag)) return false;
    if (filters.sender !== 'all' && record.email.sender !== filters.sender) return false;

    if (filters.classification !== 'all') {
      if (record.analysis?.extractedData?.classification !== filters.classification) return false;
    }

    if (fromTime != null || toTime != null) {
      const received = new Date(record.email.receivedAt).getTime();
      if (fromTime != null && received < fromTime) return false;
      if (toTime != null && received > toTime) return false;
    }

    if (term && !searchableText(record).includes(term)) return false;

    return true;
  });
}

/** Tab counts, computed once so each tab does not re-filter the whole set. */
export function statusCounts(records: readonly WorkspaceRecord[]): Record<StatusFilter, number> {
  return {
    all: records.length,
    unprocessed: records.filter((record) => matchesStatus(record, 'unprocessed')).length,
    processing: records.filter((record) => matchesStatus(record, 'processing')).length,
    completed: records.filter((record) => matchesStatus(record, 'completed')).length,
    needs_review: records.filter((record) => matchesStatus(record, 'needs_review')).length,
    failed: records.filter((record) => matchesStatus(record, 'failed')).length,
  };
}

export function distinctSenders(records: readonly WorkspaceRecord[]): string[] {
  return [...new Set(records.map((record) => record.email.sender))].sort((left, right) =>
    left.localeCompare(right),
  );
}

export function distinctClassifications(
  records: readonly WorkspaceRecord[],
): EmailClassification[] {
  const values = records
    .map((record) => record.analysis?.extractedData?.classification)
    .filter((value): value is EmailClassification => value !== undefined);
  return [...new Set(values)].sort((left, right) => left.localeCompare(right));
}
