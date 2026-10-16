import { type AnalysisDetail } from '@email-ai/contracts';
import { type Analysis } from './analysis.entity.js';

/** Maps the persisted row onto the wire contract, with timestamps as ISO 8601. */
export function toAnalysisDetail(entity: Analysis): AnalysisDetail {
  return {
    id: entity.id,
    emailId: entity.emailId,
    status: entity.status,
    extractedData: entity.extractedData ?? null,
    validationErrors: entity.validationErrors ?? null,
    modelName: entity.modelName,
    modelMetadata: entity.modelMetadata ?? null,
    operations: entity.operationMetadata ?? null,
    failureCode: entity.failureCode,
    failureMessage: entity.failureMessage,
    startedAt: entity.startedAt?.toISOString() ?? null,
    completedAt: entity.completedAt?.toISOString() ?? null,
    createdAt: entity.createdAt.toISOString(),
    updatedAt: entity.updatedAt.toISOString(),
  };
}
