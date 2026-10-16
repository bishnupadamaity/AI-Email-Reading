import { z } from 'zod';

/** Outcome a human reviewer can record for a queued analysis. */
export const reviewDecisionSchema = z.enum(['approved', 'corrected', 'rejected']);
export type ReviewDecision = z.infer<typeof reviewDecisionSchema>;

/** Why an analysis was routed to a human instead of being auto-accepted. */
export const reviewReasonSchema = z.enum([
  'low_confidence',
  'missing_required_field',
  'validation_failed',
  'processing_error',
]);
export type ReviewReason = z.infer<typeof reviewReasonSchema>;
