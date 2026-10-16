import { z } from 'zod';
import { idSchema, isoTimestampSchema } from './common.js';

/**
 * Lifecycle of an ingested email. Only `received` is reachable today; the
 * remaining transitions arrive with the analysis pipeline.
 */
export const emailStatusSchema = z.enum([
  'received',
  'queued',
  'analyzing',
  'analyzed',
  'needs_review',
  'failed',
]);
export type EmailStatus = z.infer<typeof emailStatusSchema>;

/**
 * Sender as it appeared on the message. Kept as a single string so both bare
 * addresses and `Name <addr>` forms round-trip; structured parsing belongs to
 * real ingestion, not to this contract.
 */
const senderSchema = z.string().trim().min(3).max(320);

/** Body of `POST /api/v1/emails`. */
export const createEmailSchema = z.object({
  /**
   * Provider message id, used for de-duplication. Unique per email account
   * rather than globally — different accounts legitimately see the same id.
   */
  externalMessageId: z.string().trim().min(1).max(998).nullish(),
  /** Account the message was received on. Nullable until accounts exist. */
  emailAccountId: idSchema.nullish(),
  sender: senderSchema,
  subject: z.string().trim().max(998),
  bodyText: z.string().max(1_000_000),
  receivedAt: isoTimestampSchema,
});
export type CreateEmail = z.infer<typeof createEmailSchema>;

/** Projection returned by `GET /api/v1/emails`. Excludes the body. */
export const emailSummarySchema = z.object({
  id: idSchema,
  externalMessageId: z.string().nullable(),
  emailAccountId: idSchema.nullable(),
  sender: z.string(),
  subject: z.string(),
  receivedAt: isoTimestampSchema,
  processingStatus: emailStatusSchema,
  createdAt: isoTimestampSchema,
});
export type EmailSummary = z.infer<typeof emailSummarySchema>;

/** Analysis reference embedded in an email's detail response. */
export const emailAnalysisRefSchema = z.object({
  id: idSchema,
  status: z.string(),
  createdAt: isoTimestampSchema,
});

/** Response of `GET /api/v1/emails/:id` and `POST /api/v1/emails`. */
export const emailDetailSchema = emailSummarySchema.extend({
  bodyText: z.string(),
  updatedAt: isoTimestampSchema,
  /** Most recent analysis for this email, if one exists. */
  latestAnalysis: emailAnalysisRefSchema.nullable(),
});
export type EmailDetail = z.infer<typeof emailDetailSchema>;
