import { type EmailDetail, type EmailSummary } from '@email-ai/contracts';
import { type Analysis } from '../analyses/analysis.entity.js';
import { type Email } from './email.entity.js';

/** List projection. The body is deliberately omitted. */
export function toEmailSummary(entity: Email): EmailSummary {
  return {
    id: entity.id,
    externalMessageId: entity.externalMessageId,
    emailAccountId: entity.emailAccountId,
    sender: entity.sender,
    subject: entity.subject,
    receivedAt: entity.receivedAt.toISOString(),
    processingStatus: entity.processingStatus,
    createdAt: entity.createdAt.toISOString(),
  };
}

/** Detail projection, including the body and the most recent analysis. */
export function toEmailDetail(entity: Email, latestAnalysis: Analysis | null): EmailDetail {
  return {
    ...toEmailSummary(entity),
    bodyText: entity.bodyText,
    updatedAt: entity.updatedAt.toISOString(),
    latestAnalysis: latestAnalysis
      ? {
          id: latestAnalysis.id,
          status: latestAnalysis.status,
          createdAt: latestAnalysis.createdAt.toISOString(),
        }
      : null,
  };
}
