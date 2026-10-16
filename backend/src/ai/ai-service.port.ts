import { type AiExtractRequest, type AiExtractResponse } from '@email-ai/contracts';

/** Injection token for the AI service client. */
export const AI_SERVICE = Symbol('AI_SERVICE');

/**
 * The boundary between this API and the AI service.
 *
 * The API knows three things about AI: which operation it wants, the email to
 * run it on, and what came back. It holds no provider credential, no model
 * name and no prompt — all of that lives in `ai-service`.
 *
 * `extract` resolves whenever the AI service produced an outcome, including a
 * *failed* one: a refusal, a timeout or unusable output is a result to persist,
 * not an exception. It throws `AiServiceError` only when there is no outcome to
 * record — the service is misconfigured, unreachable, or answered something
 * that is not the contract.
 */
export interface AiService {
  extract(request: AiExtractRequest): Promise<AiExtractResponse>;
}

/** Why a call to the AI service produced no outcome. */
export type AiServiceFailureCode = 'configuration' | 'timeout' | 'unavailable' | 'invalid_response';

/**
 * A transport-level failure, carrying the analysis failure code it maps to.
 *
 * `message` is written for operators and never contains email content or a
 * credential: the AI service does not put either in an error body, and this
 * class does not add any.
 */
export class AiServiceError extends Error {
  constructor(
    readonly code: AiServiceFailureCode,
    message: string,
    /** True when an operator must act before any analysis can succeed. */
    readonly isConfiguration = false,
  ) {
    super(message);
    this.name = 'AiServiceError';
  }
}
