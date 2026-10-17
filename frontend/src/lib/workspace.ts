import {
  type AnalysisDetail,
  type Conflict,
  type EmailDetail,
  type MissingField,
} from '@email-ai/contracts';
import { type WorkspaceRecord } from '../hooks/use-workspace-scan';
import {
  deriveReviewSignals,
  highestSeverity,
  needsReview,
  type ReviewSignal,
  type Severity,
} from './extraction';
import { dayKey } from './format';

/**
 * Derivations over a workspace scan. Pure functions only: components read
 * these, they do not compute over records themselves.
 *
 * Every count here describes the *scanned* records, never the whole workspace,
 * because the API exposes no aggregate endpoint. Callers are expected to say so
 * (see `DerivedNotice`).
 */

export interface WorkspaceSummary {
  /** Server-reported email total, the one figure that is not derived. */
  totalEmails: number;
  scanned: number;
  pending: number;
  processing: number;
  completed: number;
  failed: number;
  /** Analyses that ran: `completed + failed`. */
  ran: number;
  needsReview: number;
  conflicts: number;
  conflictedEmails: number;
  missingFields: number;
  emailsMissingInformation: number;
  /** `completed / ran`, or `null` when nothing has run. */
  extractionRate: number | null;
}

export function summarize(
  records: readonly WorkspaceRecord[],
  totalEmails: number,
): WorkspaceSummary {
  let pending = 0;
  let processing = 0;
  let completed = 0;
  let failed = 0;
  let needsReviewCount = 0;
  let conflicts = 0;
  let conflictedEmails = 0;
  let missingFields = 0;
  let emailsMissingInformation = 0;

  for (const record of records) {
    const status = record.analysis?.status;
    if (status === 'pending') pending += 1;
    else if (status === 'processing') processing += 1;
    else if (status === 'completed') completed += 1;
    else if (status === 'failed') failed += 1;

    const signals = deriveReviewSignals(record.analysis);
    if (needsReview(signals)) needsReviewCount += 1;

    const extraction = record.analysis?.extractedData;
    if (extraction) {
      if (extraction.conflicts.length > 0) {
        conflicts += extraction.conflicts.length;
        conflictedEmails += 1;
      }
      if (extraction.missingFields.length > 0) {
        missingFields += extraction.missingFields.length;
        emailsMissingInformation += 1;
      }
    }
  }

  const ran = completed + failed;

  return {
    totalEmails,
    scanned: records.length,
    pending,
    processing,
    completed,
    failed,
    ran,
    needsReview: needsReviewCount,
    conflicts,
    conflictedEmails,
    missingFields,
    emailsMissingInformation,
    extractionRate: ran === 0 ? null : completed / ran,
  };
}

/* --- review queue ------------------------------------------------------- */

export interface ReviewItem {
  email: EmailDetail;
  analysis: AnalysisDetail | null;
  signals: readonly ReviewSignal[];
  severity: Severity;
  /** Age of the signal: when the analysis last changed, else when ingested. */
  since: string;
}

export function reviewItems(records: readonly WorkspaceRecord[]): ReviewItem[] {
  return records
    .map((record) => {
      const signals = deriveReviewSignals(record.analysis);
      return { record, signals };
    })
    .filter(({ signals }) => needsReview(signals))
    .map(({ record, signals }) => ({
      email: record.email,
      analysis: record.analysis,
      signals,
      severity: highestSeverity(signals) ?? 'low',
      since: record.analysis?.completedAt ?? record.analysis?.updatedAt ?? record.email.receivedAt,
    }))
    .sort((left, right) => {
      if (left.severity !== right.severity) {
        return left.severity === 'high'
          ? -1
          : right.severity === 'high'
            ? 1
            : left.severity === 'medium'
              ? -1
              : 1;
      }
      return new Date(right.since).getTime() - new Date(left.since).getTime();
    });
}

/* --- conflicts ---------------------------------------------------------- */

export interface ConflictRow {
  id: string;
  email: EmailDetail;
  analysis: AnalysisDetail;
  conflict: Conflict;
  detectedAt: string;
}

export function conflictRows(records: readonly WorkspaceRecord[]): ConflictRow[] {
  const rows: ConflictRow[] = [];

  for (const record of records) {
    const analysis = record.analysis;
    if (!analysis?.extractedData) continue;

    for (const conflict of analysis.extractedData.conflicts) {
      rows.push({
        id: `${analysis.id}:${conflict.field}`,
        email: record.email,
        analysis,
        conflict,
        detectedAt: analysis.completedAt ?? analysis.updatedAt,
      });
    }
  }

  return rows.sort(
    (left, right) => new Date(right.detectedAt).getTime() - new Date(left.detectedAt).getTime(),
  );
}

/* --- missing information ------------------------------------------------ */

export interface MissingRow {
  id: string;
  email: EmailDetail;
  analysis: AnalysisDetail;
  missing: MissingField;
  /** Shipment reference when the extraction found one, for grouping. */
  shipmentReference: string | null;
  reportedAt: string;
}

export function missingRows(records: readonly WorkspaceRecord[]): MissingRow[] {
  const rows: MissingRow[] = [];

  for (const record of records) {
    const analysis = record.analysis;
    const extraction = analysis?.extractedData;
    if (!analysis || !extraction) continue;

    for (const missing of extraction.missingFields) {
      rows.push({
        id: `${analysis.id}:${missing.field}`,
        email: record.email,
        analysis,
        missing,
        shipmentReference: extraction.shipmentReference.value,
        reportedAt: analysis.completedAt ?? analysis.updatedAt,
      });
    }
  }

  return rows.sort(
    (left, right) => new Date(right.reportedAt).getTime() - new Date(left.reportedAt).getTime(),
  );
}

/* --- activity ----------------------------------------------------------- */

export type ActivityKind =
  | 'email_ingested'
  | 'analysis_created'
  | 'analysis_started'
  | 'analysis_completed'
  | 'analysis_failed';

export interface ActivityEvent {
  id: string;
  kind: ActivityKind;
  at: string;
  emailId: string;
  subject: string;
  sender: string;
  analysisId: string | null;
  detail: string | null;
}

/**
 * Reconstructs a timeline from the timestamps the database actually stores.
 *
 * There is no audit log: these events are inferred from `emails.created_at` and
 * the analysis `created_at`/`started_at`/`completed_at` columns. Human review
 * actions and extraction edits cannot appear here because nothing records them.
 */
export function activityEvents(records: readonly WorkspaceRecord[]): ActivityEvent[] {
  const events: ActivityEvent[] = [];

  for (const { email, analysis } of records) {
    events.push({
      id: `${email.id}:ingested`,
      kind: 'email_ingested',
      at: email.createdAt,
      emailId: email.id,
      subject: email.subject,
      sender: email.sender,
      analysisId: null,
      detail: null,
    });

    if (!analysis) continue;

    events.push({
      id: `${analysis.id}:created`,
      kind: 'analysis_created',
      at: analysis.createdAt,
      emailId: email.id,
      subject: email.subject,
      sender: email.sender,
      analysisId: analysis.id,
      detail: 'Pending analysis recorded with the email',
    });

    if (analysis.startedAt) {
      events.push({
        id: `${analysis.id}:started`,
        kind: 'analysis_started',
        at: analysis.startedAt,
        emailId: email.id,
        subject: email.subject,
        sender: email.sender,
        analysisId: analysis.id,
        detail: analysis.modelName,
      });
    }

    if (analysis.completedAt) {
      const failed = analysis.status === 'failed';
      events.push({
        id: `${analysis.id}:${failed ? 'failed' : 'completed'}`,
        kind: failed ? 'analysis_failed' : 'analysis_completed',
        at: analysis.completedAt,
        emailId: email.id,
        subject: email.subject,
        sender: email.sender,
        analysisId: analysis.id,
        detail: failed ? (analysis.failureCode ?? 'failed') : (analysis.modelName ?? null),
      });
    }
  }

  return events.sort((left, right) => new Date(right.at).getTime() - new Date(left.at).getTime());
}

/* --- volume series ------------------------------------------------------ */

export interface VolumePoint {
  day: string;
  received: number;
  completed: number;
  failed: number;
}

/** One bucket per day for the last `days` days, including empty days. */
export function volumeSeries(records: readonly WorkspaceRecord[], days: number): VolumePoint[] {
  const buckets = new Map<string, VolumePoint>();
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  for (let offset = days - 1; offset >= 0; offset -= 1) {
    const date = new Date(today.getTime() - offset * 86_400_000);
    const key = dayKey(date.toISOString());
    buckets.set(key, { day: key, received: 0, completed: 0, failed: 0 });
  }

  for (const { email, analysis } of records) {
    const receivedKey = dayKey(email.receivedAt);
    const bucket = buckets.get(receivedKey);
    if (bucket) bucket.received += 1;

    if (analysis?.completedAt) {
      const completedBucket = buckets.get(dayKey(analysis.completedAt));
      if (completedBucket) {
        if (analysis.status === 'failed') completedBucket.failed += 1;
        else completedBucket.completed += 1;
      }
    }
  }

  return [...buckets.values()];
}

/* --- model usage -------------------------------------------------------- */

export interface ModelUsageRow {
  key: string;
  operation: string;
  provider: string;
  model: string;
  calls: number;
  succeeded: number;
  failed: number;
  inputTokens: number;
  outputTokens: number;
  cachedInputTokens: number;
  reasoningTokens: number;
  totalLatencyMs: number;
}

/**
 * Per-operation model accounting, summed from `analyses.operations`.
 *
 * Only analyses that actually called a provider contribute, so an empty result
 * means no model has run on the scanned records — not that usage is zero.
 */
export function modelUsage(records: readonly WorkspaceRecord[]): ModelUsageRow[] {
  const rows = new Map<string, ModelUsageRow>();

  for (const { analysis } of records) {
    for (const operation of analysis?.operations ?? []) {
      const key = `${operation.operation}:${operation.provider}:${operation.model}`;
      const row = rows.get(key) ?? {
        key,
        operation: operation.operation,
        provider: operation.provider,
        model: operation.model,
        calls: 0,
        succeeded: 0,
        failed: 0,
        inputTokens: 0,
        outputTokens: 0,
        cachedInputTokens: 0,
        reasoningTokens: 0,
        totalLatencyMs: 0,
      };

      row.calls += 1;
      if (operation.status === 'succeeded') row.succeeded += 1;
      else row.failed += 1;
      row.inputTokens += operation.inputTokens ?? 0;
      row.outputTokens += operation.outputTokens ?? 0;
      row.cachedInputTokens += operation.cachedInputTokens ?? 0;
      row.reasoningTokens += operation.reasoningTokens ?? 0;
      row.totalLatencyMs += operation.latencyMs;

      rows.set(key, row);
    }
  }

  return [...rows.values()].sort((left, right) => right.calls - left.calls);
}

/* --- attention feed ----------------------------------------------------- */

export type AttentionKind = 'conflict' | 'missing' | 'failed' | 'awaiting_review' | 'not_analyzed';

export interface AttentionItem {
  id: string;
  kind: AttentionKind;
  severity: Severity;
  title: string;
  detail: string;
  at: string;
  emailId: string;
}

/** Prioritised work list for the overview, newest-first within severity. */
export function attentionItems(records: readonly WorkspaceRecord[]): AttentionItem[] {
  const items: AttentionItem[] = [];

  for (const { email, analysis } of records) {
    if (!analysis) continue;

    if (analysis.status === 'failed') {
      items.push({
        id: `${analysis.id}:failed`,
        kind: 'failed',
        severity: 'high',
        title: email.subject || '(no subject)',
        detail: `Analysis failed — ${analysis.failureCode ?? 'unknown code'}`,
        at: analysis.completedAt ?? analysis.updatedAt,
        emailId: email.id,
      });
      continue;
    }

    const extraction = analysis.extractedData;
    if (extraction?.conflicts.length) {
      items.push({
        id: `${analysis.id}:conflicts`,
        kind: 'conflict',
        severity: 'high',
        title: email.subject || '(no subject)',
        detail: `${extraction.conflicts.length} conflicting ${
          extraction.conflicts.length === 1 ? 'field' : 'fields'
        } — ${extraction.conflicts.map((conflict) => conflict.field).join(', ')}`,
        at: analysis.completedAt ?? analysis.updatedAt,
        emailId: email.id,
      });
    }

    if (extraction?.missingFields.length) {
      items.push({
        id: `${analysis.id}:missing`,
        kind: 'missing',
        severity: 'medium',
        title: email.subject || '(no subject)',
        detail: `${extraction.missingFields.length} missing ${
          extraction.missingFields.length === 1 ? 'field' : 'fields'
        } — ${extraction.missingFields.map((entry) => entry.field).join(', ')}`,
        at: analysis.completedAt ?? analysis.updatedAt,
        emailId: email.id,
      });
    }

    if (analysis.status === 'pending') {
      items.push({
        id: `${analysis.id}:pending`,
        kind: 'not_analyzed',
        severity: 'low',
        title: email.subject || '(no subject)',
        detail: 'Ingested; extraction has not run',
        at: email.receivedAt,
        emailId: email.id,
      });
    }
  }

  return items.sort((left, right) => {
    const bySeverity =
      (left.severity === 'high' ? 0 : left.severity === 'medium' ? 1 : 2) -
      (right.severity === 'high' ? 0 : right.severity === 'medium' ? 1 : 2);
    if (bySeverity !== 0) return bySeverity;
    return new Date(right.at).getTime() - new Date(left.at).getTime();
  });
}
