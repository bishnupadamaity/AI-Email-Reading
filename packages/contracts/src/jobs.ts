import { z } from 'zod';
import { idSchema } from './common.js';

/**
 * Queue contract between `apps/api` (producer) and `apps/worker` (consumer).
 * It lives here so neither application owns — or duplicates — the job names.
 */
export const EMAIL_ANALYSIS_QUEUE_NAME = 'email-analysis';

export const EmailAnalysisJob = {
  Analyze: 'analyze-email',
} as const;

export type EmailAnalysisJobName = (typeof EmailAnalysisJob)[keyof typeof EmailAnalysisJob];

/**
 * The worker loads the email itself, so the payload stays a reference rather
 * than a snapshot that could go stale in the queue.
 */
export const analyzeEmailJobDataSchema = z.object({
  emailId: idSchema,
});
export type AnalyzeEmailJobData = z.infer<typeof analyzeEmailJobDataSchema>;
