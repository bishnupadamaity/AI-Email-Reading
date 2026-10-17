/**
 * What the API can actually do today.
 *
 * This module is the dashboard's honesty layer: every action that the backend
 * cannot perform is declared here once, and the UI reads it to disable the
 * control and explain why. Nothing in the interface may claim a write
 * succeeded unless the capability below says an endpoint exists for it.
 *
 * Verified against `backend/src/**` and `docs/api.md`: the implemented surface
 * is emails (create, list, detail, analyze), analyses (detail) and health.
 */

export type CapabilityId =
  | 'emailIngest'
  | 'emailList'
  | 'emailDetail'
  | 'runAnalysis'
  | 'analysisDetail'
  | 'health'
  | 'serverSideSearch'
  | 'serverSideFilter'
  | 'serverSideSort'
  | 'aggregateMetrics'
  | 'analysisList'
  | 'analysisHistory'
  | 'reviewQueue'
  | 'reviewDecision'
  | 'fieldEdit'
  | 'reviewerAssignment'
  | 'conflictResolution'
  | 'attachments'
  | 'documentExtraction'
  | 'auditLog'
  | 'evaluations'
  | 'modelConfigRead'
  | 'settingsWrite'
  | 'notifications'
  | 'auth';

interface Capability {
  /** Human-readable name of the feature. */
  readonly label: string;
  /** True only when an implemented endpoint backs the feature. */
  readonly supported: boolean;
  /** Endpoint(s) that back it, or that would need to exist. */
  readonly endpoint: string;
  /** Shown verbatim in tooltips and empty states when unsupported. */
  readonly reason?: string;
}

export const capabilities: Readonly<Record<CapabilityId, Capability>> = {
  emailIngest: {
    label: 'Ingest an email',
    supported: true,
    endpoint: 'POST /v1/emails',
  },
  emailList: {
    label: 'List emails',
    supported: true,
    endpoint: 'GET /v1/emails?page&pageSize',
  },
  emailDetail: {
    label: 'Read one email',
    supported: true,
    endpoint: 'GET /v1/emails/:id',
  },
  runAnalysis: {
    label: 'Run or retry analysis',
    supported: true,
    endpoint: 'POST /v1/emails/:id/analyze',
  },
  analysisDetail: {
    label: 'Read one analysis',
    supported: true,
    endpoint: 'GET /v1/analyses/:id',
  },
  health: {
    label: 'Service health',
    supported: true,
    endpoint: 'GET /health, GET /health/ready',
  },

  serverSideSearch: {
    label: 'Search emails',
    supported: false,
    endpoint: 'GET /v1/emails?q=…',
    reason:
      'The list endpoint accepts only page and pageSize. Search runs in the browser across the emails loaded on this page.',
  },
  serverSideFilter: {
    label: 'Filter emails',
    supported: false,
    endpoint: 'GET /v1/emails?status=…&classification=…',
    reason:
      'The list endpoint accepts no filter parameters. Filtering is applied in the browser to the emails loaded on this page.',
  },
  serverSideSort: {
    label: 'Sort emails',
    supported: false,
    endpoint: 'GET /v1/emails?sort=…',
    reason:
      'The list endpoint always returns received_at DESC. Re-sorting is applied in the browser to the emails loaded on this page.',
  },
  aggregateMetrics: {
    label: 'Workspace metrics',
    supported: false,
    endpoint: 'GET /v1/metrics/summary',
    reason:
      'No aggregate endpoint exists. Counts on this page are computed in the browser from the emails and analyses that were scanned.',
  },
  analysisList: {
    label: 'List analyses',
    supported: false,
    endpoint: 'GET /v1/analyses',
    reason:
      'Analyses can only be fetched one at a time by id. This page scans emails and reads each latest analysis individually.',
  },
  analysisHistory: {
    label: 'Previous analysis attempts',
    supported: false,
    endpoint: 'GET /v1/emails/:id/analyses',
    reason:
      'Only the latest analysis is reachable. Failed earlier attempts are stored as separate rows but no endpoint lists them.',
  },

  reviewQueue: {
    label: 'Review queue',
    supported: false,
    endpoint: 'GET /v1/review-items',
    reason:
      'There is no review_items table or endpoint. This queue is derived in the browser from completed analyses.',
  },
  reviewDecision: {
    label: 'Record a review decision',
    supported: false,
    endpoint: 'POST /v1/review-items/:id/decision',
    reason:
      'Nothing persists approvals, rejections or "reviewed" marks. The decision would be lost on reload, so the action is disabled rather than faked.',
  },
  fieldEdit: {
    label: 'Correct an extracted value',
    supported: false,
    endpoint: 'PATCH /v1/analyses/:id/fields/:field',
    reason:
      'Extraction results are immutable over the API. A human correction cannot be stored, so editing is disabled.',
  },
  reviewerAssignment: {
    label: 'Assign a reviewer',
    supported: false,
    endpoint: 'POST /v1/review-items/:id/assignee',
    reason: 'There are no users and no assignment endpoint.',
  },
  conflictResolution: {
    label: 'Resolve a conflict',
    supported: false,
    endpoint: 'POST /v1/analyses/:id/conflicts/:field/resolve',
    reason:
      'Choosing a winning value is a write the API does not accept. Conflicts can be compared here but not resolved.',
  },

  attachments: {
    label: 'Attachments',
    supported: false,
    endpoint: 'GET /v1/emails/:id/attachments',
    reason:
      'Attachments are not ingested, stored or exposed: there is no attachments table and no endpoint. Ingestion accepts a plain-text body only.',
  },
  documentExtraction: {
    label: 'Document OCR and parsing',
    supported: false,
    endpoint: 'POST /v1/attachments/:id/extract',
    reason: 'No document parsing or OCR pipeline exists in any service.',
  },
  auditLog: {
    label: 'Audit log',
    supported: false,
    endpoint: 'GET /v1/audit-logs',
    reason:
      'No audit_logs table is written. The activity shown here is reconstructed from email and analysis timestamps, which is all the database records.',
  },
  evaluations: {
    label: 'Evaluation runs',
    supported: false,
    endpoint: 'GET /v1/evaluations',
    reason:
      'No evaluation harness, dataset or endpoint exists yet, so no accuracy figure can be shown. Fabricated benchmarks would be worse than none.',
  },
  modelConfigRead: {
    label: 'Model configuration',
    supported: false,
    endpoint: 'GET /v1/config/ai',
    reason:
      'Model routing lives in the AI service environment and is deliberately not exposed to the browser. The values below are the documented defaults, not a reading of this deployment.',
  },
  settingsWrite: {
    label: 'Save settings',
    supported: false,
    endpoint: 'PATCH /v1/config/…',
    reason:
      'Configuration is environment-owned and server-side. Nothing on this page can be saved from the browser.',
  },
  notifications: {
    label: 'Notifications',
    supported: false,
    endpoint: 'GET /v1/notifications',
    reason:
      'No notification store exists. The items listed are attention signals computed from the current scan.',
  },
  auth: {
    label: 'Authentication',
    supported: false,
    endpoint: 'POST /v1/auth/login',
    reason:
      'The API has no authentication: every request is anonymous. The user shown in the sidebar is a placeholder, not a signed-in account.',
  },
} as const;

export function isSupported(id: CapabilityId): boolean {
  return capabilities[id].supported;
}

/** Tooltip/explanation text for an unsupported action. */
export function unsupportedReason(id: CapabilityId): string {
  const capability = capabilities[id];
  if (capability.supported) return '';
  return `${capability.reason ?? 'Not implemented in the API.'} Requires ${capability.endpoint}.`;
}

/** Everything the dashboard needs but the API does not provide yet. */
export const backendGaps = (Object.keys(capabilities) as CapabilityId[])
  .map((id) => ({ id, ...capabilities[id] }))
  .filter((entry) => !entry.supported);
