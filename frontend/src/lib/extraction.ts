import {
  type AnalysisDetail,
  type AnalysisStatus,
  type Conflict,
  type MissingField,
  type ShipmentExtraction,
} from '@email-ai/contracts';

/**
 * Domain reading of an extraction result. Kept out of components so the field
 * list, the field state machine and the review reasons have one definition.
 *
 * The field list below mirrors `shipmentExtractionSchema` exactly — adding a
 * field to the contract and not here would silently hide it, so the compiler is
 * made to care: `EXTRACTION_FIELDS` is typed against the schema's keys.
 */

export interface EvidencedValue {
  value: string | null;
  evidence: string | null;
}

/** Keys of `ShipmentExtraction` whose value is an evidenced field. */
export type ExtractionFieldKey = {
  [K in keyof ShipmentExtraction]: ShipmentExtraction[K] extends EvidencedValue ? K : never;
}[keyof ShipmentExtraction];

export type FieldGroup = 'parties' | 'route' | 'identifiers' | 'carrier' | 'schedule';

export interface ExtractionFieldDefinition {
  key: ExtractionFieldKey;
  label: string;
  group: FieldGroup;
}

export const FIELD_GROUP_LABELS: Record<FieldGroup, string> = {
  parties: 'Commercial',
  route: 'Route',
  identifiers: 'Identifiers',
  carrier: 'Carrier',
  schedule: 'Schedule',
};

export const EXTRACTION_FIELDS: readonly ExtractionFieldDefinition[] = [
  { key: 'supplierOrganization', label: 'Supplier', group: 'parties' },
  { key: 'shipmentReference', label: 'Shipment reference', group: 'parties' },
  { key: 'originPort', label: 'Origin port', group: 'route' },
  { key: 'destinationPort', label: 'Destination port', group: 'route' },
  { key: 'containerNumber', label: 'Container number', group: 'identifiers' },
  { key: 'billOfLadingNumber', label: 'Bill of lading', group: 'identifiers' },
  { key: 'shippingLine', label: 'Shipping line', group: 'carrier' },
  { key: 'vesselName', label: 'Vessel', group: 'carrier' },
  { key: 'voyageNumber', label: 'Voyage', group: 'carrier' },
  { key: 'estimatedDeparture', label: 'ETD', group: 'schedule' },
  { key: 'estimatedArrival', label: 'ETA', group: 'schedule' },
  { key: 'freeTime', label: 'Free time', group: 'schedule' },
] as const;

export const FIELD_LABELS: Record<string, string> = Object.fromEntries(
  EXTRACTION_FIELDS.map((field) => [field.key, field.label]),
);

/**
 * What the extraction says about one field.
 *
 * `not_stated` and `missing` are different claims: `missing` means the model
 * reported the field as one the email should have carried, `not_stated` means
 * it simply was not there and the model did not flag it.
 */
export type FieldState = 'extracted' | 'conflicting' | 'missing' | 'not_stated';

export interface FieldReading {
  key: string;
  label: string;
  group: FieldGroup;
  state: FieldState;
  value: string | null;
  evidence: string | null;
  /** Set when `state` is `conflicting`. */
  conflict?: Conflict;
  /** Set when `state` is `missing`. */
  missing?: MissingField;
}

export function readField(
  extraction: ShipmentExtraction,
  definition: ExtractionFieldDefinition,
): FieldReading {
  const raw = extraction[definition.key] as EvidencedValue;
  const conflict = extraction.conflicts.find((entry) => entry.field === definition.key);
  const missing = extraction.missingFields.find((entry) => entry.field === definition.key);

  const state: FieldState = conflict
    ? 'conflicting'
    : missing
      ? 'missing'
      : raw.value != null
        ? 'extracted'
        : 'not_stated';

  return {
    key: definition.key,
    label: definition.label,
    group: definition.group,
    state,
    value: raw.value,
    evidence: raw.evidence,
    ...(conflict ? { conflict } : {}),
    ...(missing ? { missing } : {}),
  };
}

export function readFields(extraction: ShipmentExtraction): FieldReading[] {
  return EXTRACTION_FIELDS.map((definition) => readField(extraction, definition));
}

/* --- review reasons ----------------------------------------------------- */

/**
 * Why an analysis would reach a human.
 *
 * Derived in the browser: there is no review_items table, so nothing persists
 * these. `reviewReasonSchema` in the contracts covers `validation_failed` and
 * `processing_error`; conflicting values and reported missing fields have no
 * variant there yet, which is recorded in docs/frontend-backend-gaps.md.
 */
export type DerivedReviewReason =
  | 'conflicting_values'
  | 'missing_fields'
  | 'validation_failed'
  | 'analysis_failed'
  | 'not_analyzed';

export type Severity = 'high' | 'medium' | 'low';

export const REVIEW_REASON_LABELS: Record<DerivedReviewReason, string> = {
  conflicting_values: 'Conflicting values',
  missing_fields: 'Missing information',
  validation_failed: 'Invalid model output',
  analysis_failed: 'Analysis failed',
  not_analyzed: 'Not analysed yet',
};

export const SEVERITY_RANK: Record<Severity, number> = { high: 0, medium: 1, low: 2 };

export interface ReviewSignal {
  reason: DerivedReviewReason;
  severity: Severity;
  /** One line describing the signal, drawn from the stored analysis. */
  detail: string;
  count: number;
}

export function deriveReviewSignals(analysis: AnalysisDetail | null): ReviewSignal[] {
  if (!analysis) return [];

  const signals: ReviewSignal[] = [];

  if (analysis.status === 'failed') {
    signals.push({
      reason: analysis.failureCode === 'invalid_output' ? 'validation_failed' : 'analysis_failed',
      severity: 'high',
      detail:
        analysis.failureMessage ??
        (analysis.failureCode ? `Failed with ${analysis.failureCode}.` : 'Analysis failed.'),
      count: 1,
    });
  }

  if (analysis.validationErrors?.length) {
    signals.push({
      reason: 'validation_failed',
      severity: 'high',
      detail: `${analysis.validationErrors.length} validation ${
        analysis.validationErrors.length === 1 ? 'issue' : 'issues'
      } in the model output.`,
      count: analysis.validationErrors.length,
    });
  }

  const extraction = analysis.extractedData;
  if (extraction) {
    if (extraction.conflicts.length > 0) {
      signals.push({
        reason: 'conflicting_values',
        severity: 'high',
        detail: extraction.conflicts
          .map((conflict) => FIELD_LABELS[conflict.field] ?? conflict.field)
          .join(', '),
        count: extraction.conflicts.length,
      });
    }

    if (extraction.missingFields.length > 0) {
      signals.push({
        reason: 'missing_fields',
        severity: 'medium',
        detail: extraction.missingFields
          .map((entry) => FIELD_LABELS[entry.field] ?? entry.field)
          .join(', '),
        count: extraction.missingFields.length,
      });
    }
  }

  if (analysis.status === 'pending') {
    signals.push({
      reason: 'not_analyzed',
      severity: 'low',
      detail: 'Ingested with a pending analysis; extraction has not run.',
      count: 1,
    });
  }

  return signals;
}

export function highestSeverity(signals: readonly ReviewSignal[]): Severity | null {
  return signals.reduce<Severity | null>((worst, signal) => {
    if (!worst) return signal.severity;
    return SEVERITY_RANK[signal.severity] < SEVERITY_RANK[worst] ? signal.severity : worst;
  }, null);
}

/** Only `conflicting_values` and the two failure reasons block acceptance. */
export function needsReview(signals: readonly ReviewSignal[]): boolean {
  return signals.some((signal) => signal.reason !== 'not_analyzed');
}

/* --- status presentation ------------------------------------------------ */

export type Tone = 'neutral' | 'success' | 'warning' | 'danger' | 'info' | 'accent';

export const ANALYSIS_STATUS_TONE: Record<AnalysisStatus, Tone> = {
  pending: 'neutral',
  processing: 'info',
  completed: 'success',
  failed: 'danger',
};

export const ANALYSIS_STATUS_LABELS: Record<AnalysisStatus, string> = {
  pending: 'Pending',
  processing: 'Processing',
  completed: 'Completed',
  failed: 'Failed',
};

export const SEVERITY_TONE: Record<Severity, Tone> = {
  high: 'danger',
  medium: 'warning',
  low: 'neutral',
};

/**
 * Operator-facing explanation of each failure code, and whether retrying is
 * worth it. Taken from docs/api.md — these are the codes the API persists.
 */
export const FAILURE_CODE_INFO: Record<
  string,
  { label: string; kind: 'configuration' | 'provider' | 'output' | 'internal'; hint: string }
> = {
  configuration: {
    label: 'Not configured',
    kind: 'configuration',
    hint: 'The AI service is disabled, unreachable or rejected the API token. Retrying will not help until it is configured.',
  },
  timeout: {
    label: 'Provider timeout',
    kind: 'provider',
    hint: 'The model did not answer within LLM_TIMEOUT_MS. Retrying may succeed.',
  },
  rate_limited: {
    label: 'Rate limited',
    kind: 'provider',
    hint: 'The provider rate-limited the request. Retrying later may succeed.',
  },
  unavailable: {
    label: 'Provider unavailable',
    kind: 'provider',
    hint: 'The provider was unreachable or returned a server error. Retrying may succeed.',
  },
  input_too_large: {
    label: 'Input too large',
    kind: 'configuration',
    hint: 'The prompt exceeded LLM_MAX_INPUT_CHARS and was never truncated. Retrying will fail the same way.',
  },
  refused: {
    label: 'Model refused',
    kind: 'output',
    hint: 'The model declined to process this email. Retrying is unlikely to help.',
  },
  invalid_response: {
    label: 'Unparseable output',
    kind: 'output',
    hint: 'No parseable structured output, or it was truncated. Retrying may succeed.',
  },
  invalid_output: {
    label: 'Invalid output',
    kind: 'output',
    hint: 'The output failed the shared schema or contradicted itself. See the validation issues below.',
  },
  persistence: {
    label: 'Could not be stored',
    kind: 'internal',
    hint: 'Extraction succeeded but the result could not be written. Retrying creates a new run.',
  },
};

export function describeFailure(analysis: AnalysisDetail): {
  label: string;
  kind: string;
  hint: string;
} {
  const info = analysis.failureCode ? FAILURE_CODE_INFO[analysis.failureCode] : undefined;
  return (
    info ?? {
      label: analysis.failureCode ?? 'Unknown failure',
      kind: 'internal',
      hint: 'The API recorded a failure code this dashboard does not recognise.',
    }
  );
}

/** Token totals for one analysis, from per-operation accounting when present. */
export function tokenTotals(analysis: AnalysisDetail): {
  input: number | null;
  output: number | null;
  cached: number | null;
  reasoning: number | null;
  latencyMs: number | null;
} {
  if (analysis.operations?.length) {
    const sum = (pick: (op: NonNullable<AnalysisDetail['operations']>[number]) => number | null) =>
      analysis.operations!.reduce<number | null>((total, op) => {
        const value = pick(op);
        if (value == null) return total;
        return (total ?? 0) + value;
      }, null);

    return {
      input: sum((op) => op.inputTokens),
      output: sum((op) => op.outputTokens),
      cached: sum((op) => op.cachedInputTokens),
      reasoning: sum((op) => op.reasoningTokens),
      latencyMs: sum((op) => op.latencyMs),
    };
  }

  const metadata = analysis.modelMetadata;
  if (!metadata)
    return { input: null, output: null, cached: null, reasoning: null, latencyMs: null };

  return {
    input: metadata.inputTokens,
    output: metadata.outputTokens,
    cached: metadata.cacheReadInputTokens,
    reasoning: null,
    latencyMs: metadata.latencyMs,
  };
}
