import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from '@jest/globals';
import {
  aiExtractRequestSchema,
  aiExtractResponseSchema,
  aiServiceErrorSchema,
  aiServiceReadinessSchema,
} from './ai-service.js';
import { analysisFailureCodeSchema } from './analyses.js';

/**
 * Cross-language contract tests.
 *
 * Every fixture here is also read by the Python suite
 * (`ai-service/tests/test_contract_fixtures.py`), which validates the
 * same files against the Pydantic models. A field renamed, re-cased, made
 * non-nullable or dropped on either side fails the other side's suite — which
 * is the point: nothing else forces the Zod schemas and the Pydantic models to
 * stay in step.
 */

const FIXTURES = join(import.meta.dirname, '..', '..', '..', 'test', 'fixtures');

function load(relative: string): unknown {
  return JSON.parse(readFileSync(join(FIXTURES, relative), 'utf8'));
}

function fixtureNames(directory: string, kind: 'valid' | 'invalid'): string[] {
  return readdirSync(join(FIXTURES, directory))
    .filter((name) => name.endsWith('.json'))
    .filter((name) => (kind === 'invalid') === name.startsWith('invalid-'))
    .sort();
}

describe('shared contract fixtures', () => {
  it('finds the fixture directory both suites read', () => {
    expect(fixtureNames('extraction', 'valid').length).toBeGreaterThan(0);
    expect(fixtureNames('ai-service', 'valid').length).toBeGreaterThan(0);
  });
});

describe('aiExtractRequestSchema', () => {
  it('accepts the request fixture', () => {
    const parsed = aiExtractRequestSchema.parse(load('ai-service/extract-request.json'));

    expect(parsed.operation).toBe('extraction');
    expect(parsed.email.bodyText).toContain('MSCU7654321');
  });

  it('round-trips the fixture unchanged', () => {
    // Proves the API sends exactly the shape the Python models validate.
    const original = load('ai-service/extract-request.json');

    expect(aiExtractRequestSchema.parse(original)).toEqual(original);
  });

  it('rejects an operation the AI service does not implement', () => {
    // Routing is configured for four operations; only extraction has a
    // caller, and the contract says so rather than hoping.
    const request = load('ai-service/extract-request.json') as Record<string, unknown>;

    expect(
      aiExtractRequestSchema.safeParse({ ...request, operation: 'summarization' }).success,
    ).toBe(false);
  });

  it('requires an email', () => {
    expect(aiExtractRequestSchema.safeParse({ operation: 'extraction' }).success).toBe(false);
  });
});

describe('aiExtractResponseSchema', () => {
  it.each(fixtureNames('ai-service', 'valid').filter((name) => name.includes('response')))(
    'accepts and round-trips %s',
    (name) => {
      const original = load(`ai-service/${name}`);

      expect(aiExtractResponseSchema.parse(original)).toEqual(original);
    },
  );

  it('carries the extraction and the model accounting on success', () => {
    const parsed = aiExtractResponseSchema.parse(
      load('ai-service/extract-response-succeeded.json'),
    );

    expect(parsed.status).toBe('succeeded');
    expect(parsed.extraction?.containerNumber.value).toBe('MSCU7654321');
    expect(parsed.operation).toMatchObject({ operation: 'extraction', status: 'succeeded' });
    expect(parsed.validationErrors).toBeNull();
  });

  it('carries validation issues and no extraction when output was unusable', () => {
    const parsed = aiExtractResponseSchema.parse(
      load('ai-service/extract-response-invalid-output.json'),
    );

    expect(parsed.status).toBe('failed');
    expect(parsed.failureCode).toBe('invalid_output');
    expect(parsed.extraction).toBeNull();
    expect(parsed.validationErrors?.[0]?.path).toBe('containerNumber');
  });

  it('accounts for a failed call with no tokens spent', () => {
    const parsed = aiExtractResponseSchema.parse(
      load('ai-service/extract-response-provider-failed.json'),
    );

    expect(parsed.operation).toMatchObject({ status: 'failed', failureCode: 'rate_limited' });
    expect(parsed.operation?.inputTokens).toBeNull();
  });

  it('rejects a success that carries no extraction field at all', () => {
    const { extraction: _dropped, ...withoutExtraction } = aiExtractResponseSchema.parse(
      load('ai-service/extract-response-succeeded.json'),
    );

    expect(aiExtractResponseSchema.safeParse(withoutExtraction).success).toBe(false);
  });

  it('accepts every failure code the AI service can report', () => {
    // The API persists `failureCode` straight into the analysis contract, so
    // the two vocabularies must agree.
    const codes = [
      'configuration',
      'timeout',
      'rate_limited',
      'unavailable',
      'input_too_large',
      'refused',
      'invalid_response',
      'invalid_output',
    ];

    for (const code of codes) {
      expect(analysisFailureCodeSchema.safeParse(code).success).toBe(true);
    }
  });

  it('requires an ISO timestamp with an offset on the operation record', () => {
    const response = load('ai-service/extract-response-succeeded.json') as {
      operation: Record<string, unknown>;
    };

    // Python emits `+00:00`; a naive timestamp must not pass.
    expect(
      aiExtractResponseSchema.safeParse({
        ...response,
        operation: { ...response.operation, completedAt: '2026-02-02T08:20:05.210' },
      }).success,
    ).toBe(false);
  });
});

describe('aiServiceErrorSchema', () => {
  it('accepts the 503 body the AI service returns when misconfigured', () => {
    const parsed = aiServiceErrorSchema.parse({
      statusCode: 503,
      message: 'No LLM provider is configured for the AI service.',
      failureCode: 'configuration',
    });

    expect(parsed.failureCode).toBe('configuration');
  });

  it('tolerates an error body without a failure code', () => {
    expect(
      aiServiceErrorSchema.safeParse({
        statusCode: 401,
        message: 'A valid bearer token is required.',
      }).success,
    ).toBe(true);
  });
});

describe('aiServiceReadinessSchema', () => {
  it('accepts a readiness body naming the routed models', () => {
    const parsed = aiServiceReadinessSchema.parse({
      status: 'ok',
      dependencies: { provider: 'up' },
      models: {
        classification: 'gpt-6-luna',
        extraction: 'gpt-6-sol',
        summarization: 'gpt-6-luna',
        conflict_resolution: 'gpt-6-astra',
      },
      implementedOperations: ['extraction'],
      timestamp: '2026-10-15T09:00:00.000Z',
    });

    expect(parsed.models.extraction).toBe('gpt-6-sol');
  });

  it('accepts an empty routing table when the provider is unconfigured', () => {
    expect(
      aiServiceReadinessSchema.safeParse({
        status: 'ok',
        dependencies: { provider: 'disabled' },
        models: {},
        implementedOperations: ['extraction'],
        timestamp: '2026-10-15T09:00:00.000Z',
      }).success,
    ).toBe(true);
  });
});
