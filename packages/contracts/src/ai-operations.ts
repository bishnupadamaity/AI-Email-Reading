import { z } from 'zod';
import { isoTimestampSchema } from './common.js';

/**
 * The AI operations this platform routes to models.
 *
 * Each operation is configured with its own model, so a cheap model can label
 * an email while a more capable one reasons about contradictions. Adding an
 * operation means adding it here and giving it a default in the model
 * registry — nothing else reads model names.
 *
 * Implementation status is deliberately *not* encoded here: this list is the
 * routing vocabulary, not a claim that every operation has a caller. Today only
 * `extraction` is wired up; see `docs/architecture.md`.
 */
export const AI_OPERATIONS = [
  'classification',
  'extraction',
  'summarization',
  'conflict_resolution',
] as const;

export const aiOperationSchema = z.enum(AI_OPERATIONS);
export type AiOperation = z.infer<typeof aiOperationSchema>;

/** Outcome of one model call. */
export const operationStatusSchema = z.enum(['succeeded', 'failed']);
export type OperationStatus = z.infer<typeof operationStatusSchema>;

/**
 * What one model call cost and which model actually served it.
 *
 * Recorded per operation rather than once per analysis, so an analysis that
 * runs several operations keeps a separate record for each instead of the last
 * one overwriting the rest.
 *
 * `model` is the id the provider reported handling the request — not the id
 * that was requested — so an alias resolving to a dated snapshot is captured
 * as what really ran.
 */
export const operationMetadataSchema = z.object({
  operation: aiOperationSchema,
  provider: z.string(),
  model: z.string(),
  status: operationStatusSchema,
  /** Set when `status` is `failed`. */
  failureCode: z.string().nullable(),
  inputTokens: z.number().int().nullable(),
  outputTokens: z.number().int().nullable(),
  /** Portion of `inputTokens` served from the provider's prompt cache. */
  cachedInputTokens: z.number().int().nullable(),
  /** Reasoning tokens, when the model reports them separately. */
  reasoningTokens: z.number().int().nullable(),
  latencyMs: z.number().int().nonnegative(),
  /** Why generation stopped, as the provider described it. */
  stopReason: z.string().nullable(),
  completedAt: isoTimestampSchema,
});
export type OperationMetadata = z.infer<typeof operationMetadataSchema>;
