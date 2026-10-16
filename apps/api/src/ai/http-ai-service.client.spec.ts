import { createServer, type Server } from 'node:http';
import { type AddressInfo } from 'node:net';
import { Logger } from '@nestjs/common';
import { type AiExtractRequest } from '@email-ai/contracts';
import { AiServiceError } from './ai-service.port.js';
import { HttpAiServiceClient } from './http-ai-service.client.js';
import { type ApiConfig } from '../config/index.js';

/**
 * The HTTP client against a local stub server.
 *
 * A real server (on an ephemeral loopback port) rather than a mocked `fetch`:
 * what matters here is how actual HTTP behaviour — statuses, malformed bodies,
 * a hung connection, a closed socket — maps onto failure codes, and a mock of
 * the transport would be asserting on the mock.
 *
 * No OpenAI client, no key and no outbound network: the stub stands in for the
 * Python service.
 */

const REQUEST: AiExtractRequest = {
  operation: 'extraction',
  email: {
    id: '28c76809-9dbf-481e-8237-e02c0bfba0e8',
    sender: 'dispatch@acme.example',
    subject: 'Shipment confirmation PO 4821',
    receivedAt: '2026-02-02T08:14:00.000Z',
    bodyText: 'Container MSCU7654321 departs Rotterdam.',
  },
};

const VALID_RESPONSE = {
  status: 'succeeded',
  extraction: {
    classification: 'shipment_update',
    summary: 'Container MSCU7654321 departed Rotterdam.',
    supplierOrganization: { value: 'Acme Logistics', evidence: 'Acme Logistics' },
    shipmentReference: { value: null, evidence: null },
    originPort: { value: 'Rotterdam', evidence: 'Rotterdam' },
    destinationPort: { value: null, evidence: null },
    containerNumber: { value: 'MSCU7654321', evidence: 'Container MSCU7654321' },
    billOfLadingNumber: { value: null, evidence: null },
    shippingLine: { value: null, evidence: null },
    vesselName: { value: null, evidence: null },
    voyageNumber: { value: null, evidence: null },
    estimatedDeparture: { value: null, evidence: null },
    estimatedArrival: { value: null, evidence: null },
    freeTime: { value: null, evidence: null },
    missingFields: [],
    conflicts: [],
  },
  validationErrors: null,
  failureCode: null,
  failureMessage: null,
  operation: {
    operation: 'extraction',
    provider: 'openai',
    model: 'gpt-6-sol-2026-09-01',
    status: 'succeeded',
    failureCode: null,
    inputTokens: 1_234,
    outputTokens: 567,
    cachedInputTokens: 128,
    reasoningTokens: 64,
    latencyMs: 4_210,
    stopReason: 'completed',
    completedAt: '2026-02-02T08:20:05.210+00:00',
  },
};

type Handler = (body: string) => {
  status?: number;
  body?: string;
  contentType?: string;
  /** Answer only after this delay, to imitate a slow model call. */
  delayMs?: number;
  /** Never answer, to exercise the response deadline. */
  hang?: boolean;
  /** Destroy the socket mid-flight. */
  destroy?: boolean;
};

interface Stub {
  readonly url: string;
  readonly requests: { headers: Record<string, string | string[] | undefined>; body: string }[];
  close(): Promise<void>;
}

async function startStub(handler: Handler): Promise<Stub> {
  const requests: Stub['requests'] = [];

  const server: Server = createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on('data', (chunk: Buffer) => chunks.push(chunk));
    req.on('end', () => {
      const body = Buffer.concat(chunks).toString('utf8');
      requests.push({ headers: req.headers, body });

      const outcome = handler(body);
      if (outcome.hang) return;
      if (outcome.destroy) {
        // Kill the socket rather than the request stream: that is what a
        // crashing service looks like from the client's side.
        res.destroy();
        return;
      }

      const answer = (): void => {
        res.writeHead(outcome.status ?? 200, {
          'content-type': outcome.contentType ?? 'application/json',
        });
        res.end(outcome.body ?? JSON.stringify(VALID_RESPONSE));
      };

      if (outcome.delayMs) setTimeout(answer, outcome.delayMs);
      else answer();
    });
  });

  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;

  return {
    url: `http://127.0.0.1:${port}`,
    requests,
    close: () =>
      new Promise<void>((resolve) => {
        server.closeAllConnections();
        server.close(() => resolve());
      }),
  };
}

function clientFor(overrides: Partial<ApiConfig['aiService']>): HttpAiServiceClient {
  const config = {
    aiService: {
      enabled: true,
      baseUrl: 'http://127.0.0.1:1',
      requestTimeoutMs: 2_000,
      connectTimeoutMs: 500,
      ...overrides,
    },
  } as ApiConfig;

  return new HttpAiServiceClient(config);
}

describe('HttpAiServiceClient', () => {
  let stub: Stub | undefined;

  beforeAll(() => {
    // Most cases here are failures, and the client logs each one. Silencing
    // Nest's logger keeps the suite's output readable.
    Logger.overrideLogger(false);
  });

  afterAll(() => {
    Logger.overrideLogger(console);
  });

  afterEach(async () => {
    await stub?.close();
    stub = undefined;
  });

  describe('a successful call', () => {
    it('posts the request to the extract endpoint and returns the parsed response', async () => {
      stub = await startStub(() => ({}));

      const response = await clientFor({ baseUrl: stub.url }).extract(REQUEST);

      expect(response.status).toBe('succeeded');
      expect(response.extraction?.containerNumber.value).toBe('MSCU7654321');
      expect(response.operation?.model).toBe('gpt-6-sol-2026-09-01');
      expect(JSON.parse(stub.requests[0]!.body)).toEqual(REQUEST);
    });

    it('sends the configured token as a bearer header, not in the body', async () => {
      stub = await startStub(() => ({}));

      await clientFor({ baseUrl: stub.url, token: 'shared-secret' }).extract(REQUEST);

      expect(stub.requests[0]!.headers.authorization).toBe('Bearer shared-secret');
      expect(stub.requests[0]!.body).not.toContain('shared-secret');
    });

    it('sends no authorization header when no token is configured', async () => {
      stub = await startStub(() => ({}));

      await clientFor({ baseUrl: stub.url }).extract(REQUEST);

      expect(stub.requests[0]!.headers.authorization).toBeUndefined();
    });

    it('respects a base URL carrying a path prefix', async () => {
      stub = await startStub(() => ({}));

      // A reverse proxy may mount the service under a prefix; the endpoint
      // path must be resolved against the configured base, not replace it.
      await clientFor({ baseUrl: `${stub.url}/ai/` }).extract(REQUEST);

      expect(stub.requests).toHaveLength(1);
    });
  });

  describe('responses that do not match the contract', () => {
    it('rejects a body that is not the agreed shape', async () => {
      stub = await startStub(() => ({ body: JSON.stringify({ status: 'succeeded' }) }));

      await expect(clientFor({ baseUrl: stub.url }).extract(REQUEST)).rejects.toMatchObject({
        code: 'invalid_response',
      });
    });

    it('rejects a body that is not JSON at all', async () => {
      stub = await startStub(() => ({ body: 'not json', contentType: 'text/plain' }));

      await expect(clientFor({ baseUrl: stub.url }).extract(REQUEST)).rejects.toMatchObject({
        code: 'invalid_response',
      });
    });

    it('never puts the rejected body in the error message', async () => {
      stub = await startStub(() => ({
        body: JSON.stringify({ status: 'succeeded', leaked: 'MSCU7654321' }),
      }));

      const error = (await clientFor({ baseUrl: stub.url })
        .extract(REQUEST)
        .catch((e: unknown) => e)) as AiServiceError;

      expect(error.message).not.toContain('MSCU7654321');
    });

    it('treats a reported failure as a valid response, not an error', async () => {
      // A failed extraction is an outcome the API must persist; only a broken
      // contract is an exception.
      stub = await startStub(() => ({
        body: JSON.stringify({
          status: 'failed',
          extraction: null,
          validationErrors: null,
          failureCode: 'refused',
          failureMessage: 'The model declined to process this input.',
          operation: { ...VALID_RESPONSE.operation, status: 'failed', failureCode: 'refused' },
        }),
      }));

      const response = await clientFor({ baseUrl: stub.url }).extract(REQUEST);

      expect(response.status).toBe('failed');
      expect(response.failureCode).toBe('refused');
    });
  });

  describe('error statuses', () => {
    it('maps 503 to a configuration failure and surfaces the service message', async () => {
      stub = await startStub(() => ({
        status: 503,
        body: JSON.stringify({
          statusCode: 503,
          message: 'No LLM provider is configured for the AI service.',
          failureCode: 'configuration',
        }),
      }));

      const error = (await clientFor({ baseUrl: stub.url })
        .extract(REQUEST)
        .catch((e: unknown) => e)) as AiServiceError;

      expect(error.code).toBe('configuration');
      expect(error.isConfiguration).toBe(true);
      expect(error.message).toContain('LLM provider');
    });

    it.each([401, 403] as const)(
      'maps %s to a configuration failure naming the token',
      async (status: number) => {
        stub = await startStub(() => ({
          status,
          body: JSON.stringify({
            statusCode: status,
            message: 'A valid bearer token is required.',
          }),
        }));

        const error = (await clientFor({ baseUrl: stub.url })
          .extract(REQUEST)
          .catch((e: unknown) => e)) as AiServiceError;

        expect(error.code).toBe('configuration');
        expect(error.isConfiguration).toBe(true);
        expect(error.message).toContain('AI_SERVICE_TOKEN');
      },
    );

    it('maps 404 to a configuration failure naming the URL setting', async () => {
      stub = await startStub(() => ({ status: 404, body: '{}' }));

      const error = (await clientFor({ baseUrl: stub.url })
        .extract(REQUEST)
        .catch((e: unknown) => e)) as AiServiceError;

      expect(error.code).toBe('configuration');
      expect(error.message).toContain('AI_SERVICE_URL');
    });

    it('maps 422 to invalid_response, because the two sides disagree', async () => {
      stub = await startStub(() => ({
        status: 422,
        body: JSON.stringify({
          statusCode: 422,
          message: 'Request validation failed for: email.receivedAt',
        }),
      }));

      const error = (await clientFor({ baseUrl: stub.url })
        .extract(REQUEST)
        .catch((e: unknown) => e)) as AiServiceError;

      expect(error.code).toBe('invalid_response');
      expect(error.isConfiguration).toBe(false);
      expect(error.message).toContain('email.receivedAt');
    });

    it('maps 500 to unavailable', async () => {
      stub = await startStub(() => ({ status: 500, body: '{}' }));

      await expect(clientFor({ baseUrl: stub.url }).extract(REQUEST)).rejects.toMatchObject({
        code: 'unavailable',
      });
    });
  });

  describe('transport failures', () => {
    it('maps a response that never arrives to a timeout', async () => {
      stub = await startStub(() => ({ hang: true }));

      const error = (await clientFor({ baseUrl: stub.url, requestTimeoutMs: 1_000 })
        .extract(REQUEST)
        .catch((e: unknown) => e)) as AiServiceError;

      expect(error.code).toBe('timeout');
      expect(error.message).toContain('1000ms');
    });

    it('maps a dropped connection to unavailable', async () => {
      stub = await startStub(() => ({ destroy: true }));

      await expect(clientFor({ baseUrl: stub.url }).extract(REQUEST)).rejects.toMatchObject({
        code: 'unavailable',
      });
    });

    it('maps a refused connection to unavailable and names the URL', async () => {
      // Port 1 on loopback: nothing is listening.
      const error = (await clientFor({ baseUrl: 'http://127.0.0.1:1' })
        .extract(REQUEST)
        .catch((e: unknown) => e)) as AiServiceError;

      expect(error.code).toBe('unavailable');
      expect(error.message).toContain('http://127.0.0.1:1');
      expect(error.isConfiguration).toBe(false);
    });

    it('does not report a connection failure as a timeout', async () => {
      // The distinction matters: "cannot reach it" and "it is slow" call for
      // different operator action.
      const error = (await clientFor({ baseUrl: 'http://127.0.0.1:1' })
        .extract(REQUEST)
        .catch((e: unknown) => e)) as AiServiceError;

      expect(error.code).not.toBe('timeout');
    });

    it('allows a slow but healthy response well past the connect deadline', async () => {
      // The decisive test for separate deadlines: a model call takes seconds,
      // so a short connect timeout must not abort a response that is simply
      // slow to arrive. One combined deadline would fail this.
      stub = await startStub(() => ({ delayMs: 400 }));

      const response = await clientFor({
        baseUrl: stub.url,
        connectTimeoutMs: 100,
        requestTimeoutMs: 5_000,
      }).extract(REQUEST);

      expect(response.status).toBe('succeeded');
    });
  });
});
