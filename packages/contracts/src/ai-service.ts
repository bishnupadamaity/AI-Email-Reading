import { z } from 'zod';
import { aiOperationSchema, operationMetadataSchema } from './ai-operations.js';
import { validationIssueSchema } from './analyses.js';
import { idSchema, isoTimestampSchema } from './common.js';
import { shipmentExtractionSchema } from './extraction.js';

/**
 * Internal HTTP contract between `backend` (NestJS) and `ai-service`
 * (Python/FastAPI).
 *
 * Mirrored on the Python side by `ai_service/models/wire.py`, and pinned by the
 * shared fixtures in `test/fixtures/ai-service/`, which both suites validate —
 * so neither side can change the contract without the other's tests failing.
 *
 * Not a public API: it is served on a loopback (or network-restricted) address
 * and is never reachable from the browser. Nothing in it carries a credential
 * in either direction — the OpenAI key lives only in the AI service's own
 * configuration.
 */

/** Operations the AI service actually implements today. */
export const implementedAiOperationSchema = z.literal('extraction');
export type ImplementedAiOperation = z.infer<typeof implementedAiOperationSchema>;

/** The message the AI service is asked to operate on. */
export const aiEmailPayloadSchema = z.object({
  /**
   * For correlating logs across the two services. The AI service has no
   * database access and never uses it to fetch anything.
   */
  id: idSchema.nullish(),
  sender: z.string(),
  subject: z.string(),
  receivedAt: isoTimestampSchema,
  bodyText: z.string(),
});
export type AiEmailPayload = z.infer<typeof aiEmailPayloadSchema>;

/**
 * Body of `POST /internal/v1/ai/extract`.
 *
 * `operation` is explicit rather than implied by the path: the API states which
 * operation it wants, and a request for an operation with no implementation yet
 * is rejected by the AI service instead of quietly running a different one.
 */
export const aiExtractRequestSchema = z.object({
  operation: implementedAiOperationSchema,
  email: aiEmailPayloadSchema,
});
export type AiExtractRequest = z.infer<typeof aiExtractRequestSchema>;

/**
 * Response of `POST /internal/v1/ai/extract`.
 *
 * A `200` means the operation ran and its outcome is reported — check
 * `status`. A `failed` status is a recorded outcome (refusal, timeout, rate
 * limit, unusable or self-contradictory output), not a transport error. A `503`
 * means the AI service itself is misconfigured; see `aiServiceErrorSchema`.
 */
export const aiExtractResponseSchema = z.object({
  status: z.enum(['succeeded', 'failed']),
  /** Present only when `status` is `succeeded`. */
  extraction: shipmentExtractionSchema.nullable(),
  /** Present when the model answered but its output was unusable. */
  validationErrors: z.array(validationIssueSchema).nullable(),
  failureCode: z.string().nullable(),
  /**
   * Short, operator-safe explanation. Never contains email content, the
   * prompt, or any credential.
   */
  failureMessage: z.string().nullable(),
  /** Accounting for the model call. `null` only when no call was made. */
  operation: operationMetadataSchema.nullable(),
});
export type AiExtractResponse = z.infer<typeof aiExtractResponseSchema>;

/** Error body the AI service returns for any non-2xx response. */
export const aiServiceErrorSchema = z.object({
  statusCode: z.number().int(),
  message: z.string(),
  failureCode: z.string().nullish(),
});
export type AiServiceError = z.infer<typeof aiServiceErrorSchema>;

/** Readiness body of the AI service, for diagnostics. */
export const aiServiceReadinessSchema = z.object({
  status: z.literal('ok'),
  dependencies: z.record(z.string(), z.enum(['up', 'disabled'])),
  /**
   * Operation-to-model routing. Partial on purpose: the table is empty when
   * the provider is unconfigured, and the AI service reports that rather than
   * inventing entries.
   */
  models: z.partialRecord(aiOperationSchema, z.string()),
  implementedOperations: z.array(z.string()),
  timestamp: isoTimestampSchema,
});
export type AiServiceReadiness = z.infer<typeof aiServiceReadinessSchema>;

/** Path of the extraction endpoint, relative to the service's base URL. */
export const AI_EXTRACT_PATH = '/internal/v1/ai/extract';
/** Liveness and readiness paths, for diagnostics and documentation. */
export const AI_HEALTH_PATH = '/health';
export const AI_READINESS_PATH = '/health/ready';
