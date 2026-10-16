import { z } from 'zod';

/**
 * Business-email extraction contract.
 *
 * Shared by the API (persistence and responses), the extraction provider
 * (constrained decoding) and eventually the dashboard, so there is one
 * definition of what "extracted" means.
 *
 * Two rules shape every field below:
 *
 * 1. **Absence is explicit.** Every field is required but nullable — `null`
 *    means "not stated in this email". Nothing is inferred or guessed, and
 *    required-but-nullable is also what constrained decoding handles best.
 * 2. **Values carry their evidence.** Each extracted value travels with the
 *    verbatim span it came from, so a reviewer can check the model's work
 *    without re-reading the message.
 */

/** What kind of business email this is. */
export const emailClassificationSchema = z.enum([
  'shipment_booking',
  'shipment_update',
  'arrival_notice',
  'quote_request',
  'invoice',
  'customs_document',
  'general_inquiry',
  'other',
]);
export type EmailClassification = z.infer<typeof emailClassificationSchema>;

/**
 * An extracted value together with the text it was read from.
 *
 * `evidence` is a verbatim span of the email. It is never logged — only
 * persisted — because it reproduces message content.
 */
const evidenced = <Value extends z.ZodType>(value: Value) =>
  z.object({
    value: value.nullable(),
    evidence: z.string().nullable(),
  });

const evidencedString = evidenced(z.string());

/**
 * A date exactly as the email expressed it, normalised to `YYYY-MM-DD` when
 * unambiguous. Left as a plain string rather than a strict date type: real
 * emails say "mid-March" or "week 12", and rejecting those would discard
 * information the reviewer needs.
 */
const evidencedDate = evidenced(z.string());

/** A field the email should have carried for its classification, but did not. */
export const missingFieldSchema = z.object({
  field: z.string(),
  reason: z.string().nullable(),
});
export type MissingField = z.infer<typeof missingFieldSchema>;

/**
 * Two or more incompatible values for the same field within one email.
 *
 * Recorded rather than resolved: picking a winner is a business decision, and
 * a conflict is precisely what should reach a human reviewer.
 */
export const conflictSchema = z.object({
  field: z.string(),
  values: z.array(z.string()),
  note: z.string().nullable(),
});
export type Conflict = z.infer<typeof conflictSchema>;

/** Structured result of analysing one business email. */
export const shipmentExtractionSchema = z.object({
  classification: emailClassificationSchema,
  /** One sentence, drawn from the email; no speculation. */
  summary: z.string(),

  supplierOrganization: evidencedString,
  shipmentReference: evidencedString,
  originPort: evidencedString,
  destinationPort: evidencedString,
  containerNumber: evidencedString,
  billOfLadingNumber: evidencedString,
  shippingLine: evidencedString,
  vesselName: evidencedString,
  voyageNumber: evidencedString,
  estimatedDeparture: evidencedDate,
  estimatedArrival: evidencedDate,
  /** Demurrage/detention free time, as stated (e.g. "14 days at destination"). */
  freeTime: evidencedString,

  missingFields: z.array(missingFieldSchema),
  conflicts: z.array(conflictSchema),
});
export type ShipmentExtraction = z.infer<typeof shipmentExtractionSchema>;
