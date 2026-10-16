import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { AiServiceError, type AiService, type AiServiceFailureCode } from '../../src/ai/index.js';
import {
  type AiExtractRequest,
  type AiExtractResponse,
  type AiOperation,
  type OperationMetadata,
  type ShipmentExtraction,
  type ValidationIssue,
} from '@email-ai/contracts';

/** Routing table the fake reports, mirroring per-operation configuration. */
export const FAKE_MODELS: Record<AiOperation, string> = {
  classification: 'test-classification-model',
  extraction: 'test-extraction-model',
  summarization: 'test-summarization-model',
  conflict_resolution: 'test-conflict-model',
};

export const FAKE_USAGE = {
  inputTokens: 1_234,
  outputTokens: 567,
  cachedInputTokens: 128,
  reasoningTokens: 64,
};

/**
 * A schema-valid, internally consistent extraction.
 *
 * Read from the shared fixture the Python suite also uses, so the example this
 * API is tested against is the example the AI service is tested against.
 */
export const VALID_EXTRACTION = JSON.parse(
  readFileSync(
    join(
      import.meta.dirname,
      '..',
      '..',
      '..',
      '..',
      'test',
      'fixtures',
      'extraction',
      'complete.json',
    ),
    'utf8',
  ),
) as ShipmentExtraction;

type Behaviour = (request: AiExtractRequest) => Promise<AiExtractResponse>;

/**
 * Stands in for the Python AI service at the `AiService` port.
 *
 * Everything above it — the claim, the lifecycle transitions, boundary
 * validation of the response, failure-code mapping, persistence and
 * idempotency — is the real code path, so these tests exercise the production
 * flow with no AI service running, no network call and no key.
 *
 * What it cannot cover is what the AI service itself decides: prompt
 * construction, model routing, Pydantic validation and the deterministic
 * integrity checks. Those are tested where they live, in
 * `apps/ai-service/tests`, and the two sides are held together by the shared
 * fixtures in `test/fixtures/`.
 */
export class FakeAiService implements AiService {
  readonly requests: AiExtractRequest[] = [];

  private behaviour: Behaviour = (request) =>
    Promise.resolve(this.succeeded(request, VALID_EXTRACTION));

  get callCount(): number {
    return this.requests.length;
  }

  /** Operations invoked so far, in order. */
  get operations(): AiOperation[] {
    return this.requests.map((request) => request.operation);
  }

  extract(request: AiExtractRequest): Promise<AiExtractResponse> {
    this.requests.push(request);
    return this.behaviour(request);
  }

  reset(): void {
    this.requests.length = 0;
    this.succeedsWith(VALID_EXTRACTION);
  }

  /** The AI service returns a successful extraction. */
  succeedsWith(extraction: unknown): void {
    this.behaviour = (request) =>
      Promise.resolve(this.succeeded(request, extraction as ShipmentExtraction));
  }

  /**
   * The AI service ran the operation and reported a failure: a refusal, a
   * timeout at the provider, unusable output. The run happened, so it comes
   * back as a `200` with accounting.
   */
  reportsFailure(
    failureCode: string,
    failureMessage = 'simulated',
    validationErrors: ValidationIssue[] | null = null,
    operationStatus: 'succeeded' | 'failed' = 'failed',
  ): void {
    this.behaviour = (request) =>
      Promise.resolve({
        status: 'failed',
        extraction: null,
        validationErrors,
        failureCode,
        failureMessage,
        operation: {
          ...this.operationMetadata(request, operationStatus),
          failureCode: operationStatus === 'failed' ? failureCode : null,
          ...(operationStatus === 'failed'
            ? {
                inputTokens: null,
                outputTokens: null,
                cachedInputTokens: null,
                reasoningTokens: null,
                stopReason: null,
              }
            : {}),
        },
      });
  }

  /** The AI service could not be reached, or answered off-contract. */
  failsTransport(code: AiServiceFailureCode, message = 'simulated transport failure'): void {
    this.behaviour = () =>
      Promise.reject(new AiServiceError(code, message, code === 'configuration'));
  }

  /** Any other thrown value, to exercise the unexpected-error path. */
  failsWith(error: unknown): void {
    this.behaviour = () => Promise.reject(error);
  }

  /** Blocks until the returned `release` is called; used for concurrency tests. */
  blocks(): { release: () => void } {
    let release = (): void => undefined;
    const gate = new Promise<void>((resolve) => {
      release = () => resolve();
    });

    this.behaviour = async (request) => {
      await gate;
      return this.succeeded(request, VALID_EXTRACTION);
    };

    return { release: () => release() };
  }

  private succeeded(request: AiExtractRequest, extraction: ShipmentExtraction): AiExtractResponse {
    return {
      status: 'succeeded',
      extraction,
      validationErrors: null,
      failureCode: null,
      failureMessage: null,
      operation: this.operationMetadata(request, 'succeeded'),
    };
  }

  private operationMetadata(
    request: AiExtractRequest,
    status: 'succeeded' | 'failed',
  ): OperationMetadata {
    return {
      operation: request.operation,
      provider: 'fake',
      // Reports the routed model, so tests can assert the right one was used.
      model: FAKE_MODELS[request.operation],
      status,
      failureCode: null,
      inputTokens: FAKE_USAGE.inputTokens,
      outputTokens: FAKE_USAGE.outputTokens,
      cachedInputTokens: FAKE_USAGE.cachedInputTokens,
      reasoningTokens: FAKE_USAGE.reasoningTokens,
      latencyMs: 42,
      stopReason: 'completed',
      completedAt: new Date().toISOString(),
    };
  }
}
