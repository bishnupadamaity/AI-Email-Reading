import { z } from 'zod';
import { operationMetadataSchema } from './ai-operations.js';
import { idSchema, isoTimestampSchema } from './common.js';
import { shipmentExtractionSchema } from './extraction.js';

/** Model confidence, normalised to the unit interval. */
export const confidenceSchema = z.number().min(0).max(1);
export type Confidence = z.infer<typeof confidenceSchema>;

/**
 * Lifecycle of a single analysis run against one email.
 *
 * Valid transitions: `pending → processing → completed | failed`, and
 * `failed → ` (a new run, as a new row). An analysis is only ever `completed`
 * once the extraction validated *and* was persisted.
 */
export const analysisStatusSchema = z.enum(['pending', 'processing', 'completed', 'failed']);
export type AnalysisStatus = z.infer<typeof analysisStatusSchema>;

/**
 * Seed shape for a field the LLM extracted, carrying the confidence that drives
 * the human-review decision. Superseded for shipment emails by
 * `shipmentExtractionSchema`; kept for the generic field-level model the
 * review-queue work will build on.
 */
export const extractedFieldSchema = z.object({
  name: z.string().min(1),
  value: z.string().nullable(),
  confidence: confidenceSchema,
});
export type ExtractedField = z.infer<typeof extractedFieldSchema>;

/** Why an analysis failed. Machine-readable and safe to expose. */
export const analysisFailureCodeSchema = z.enum([
  'configuration',
  'timeout',
  'rate_limited',
  'unavailable',
  'input_too_large',
  'refused',
  'invalid_response',
  'invalid_output',
  'persistence',
]);
export type AnalysisFailureCode = z.infer<typeof analysisFailureCodeSchema>;

/**
 * Provider and token accounting for the analysis as a whole.
 *
 * Retained for backward compatibility and populated from the operation that
 * produced the analysis result (today: `extraction`). Per-operation accounting
 * lives in `operations`, which is the field to read when more than one model
 * runs.
 */
export const analysisModelMetadataSchema = z.object({
  provider: z.string(),
  model: z.string(),
  inputTokens: z.number().int().nullable(),
  outputTokens: z.number().int().nullable(),
  cacheReadInputTokens: z.number().int().nullable(),
  latencyMs: z.number().int().nonnegative(),
  stopReason: z.string().nullable(),
});
export type AnalysisModelMetadata = z.infer<typeof analysisModelMetadataSchema>;

/** One reason the model's output did not satisfy the extraction schema. */
export const validationIssueSchema = z.object({
  path: z.string(),
  message: z.string(),
});
export type ValidationIssue = z.infer<typeof validationIssueSchema>;

/** Response of `GET /api/v1/analyses/:id`. */
export const analysisDetailSchema = z.object({
  id: idSchema,
  emailId: idSchema,
  status: analysisStatusSchema,
  /** Present only once an analysis has completed. */
  extractedData: shipmentExtractionSchema.nullable(),
  /** Present when the model answered but its output failed validation. */
  validationErrors: z.array(validationIssueSchema).nullable(),
  modelName: z.string().nullable(),
  modelMetadata: analysisModelMetadataSchema.nullable(),
  /**
   * One record per model call, in the order they ran. `null` for analyses that
   * predate per-operation accounting.
   */
  operations: z.array(operationMetadataSchema).nullable(),
  failureCode: analysisFailureCodeSchema.nullable(),
  /** Short, client-safe explanation. Never contains email content or secrets. */
  failureMessage: z.string().nullable(),
  startedAt: isoTimestampSchema.nullable(),
  completedAt: isoTimestampSchema.nullable(),
  createdAt: isoTimestampSchema,
  updatedAt: isoTimestampSchema,
});
export type AnalysisDetail = z.infer<typeof analysisDetailSchema>;
