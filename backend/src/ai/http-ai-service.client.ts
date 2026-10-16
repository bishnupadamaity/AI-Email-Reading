import { Inject, Injectable, Logger, type OnApplicationShutdown } from '@nestjs/common';
import {
  AI_EXTRACT_PATH,
  aiExtractResponseSchema,
  aiServiceErrorSchema,
  type AiExtractRequest,
  type AiExtractResponse,
} from '@email-ai/contracts';
import { Agent, request as undiciRequest } from 'undici';
import { API_CONFIG, type ApiConfig } from '../config/index.js';
import { AiServiceError, type AiService } from './ai-service.port.js';

/** undici error codes this client distinguishes. */
const CONNECT_TIMEOUT = 'UND_ERR_CONNECT_TIMEOUT';
const RESPONSE_TIMEOUTS = new Set(['UND_ERR_HEADERS_TIMEOUT', 'UND_ERR_BODY_TIMEOUT']);

/**
 * Calls the Python AI service over its internal HTTP contract.
 *
 * Four rules shape this client:
 *
 * 1. **Every response is validated.** The AI service is another process; its
 *    body is parsed against the shared Zod schema before anything reaches the
 *    database, exactly as any external input would be. A body that does not
 *    match is an `invalid_response`, never a partially-trusted write.
 * 2. **Connection and response are bounded separately.** `undici` is used
 *    rather than global `fetch` precisely for this: a connect deadline for
 *    *reaching* the service, and header/body deadlines for *answering*. With
 *    one combined deadline, a short connect timeout would abort every healthy
 *    extraction — the model call is slow by nature, and the response only
 *    starts once it finishes.
 * 3. **The response deadline sits above the model's own.** The AI service
 *    bounds the model call with `LLM_TIMEOUT_MS`; this deadline is meant to
 *    fire only if the service itself hangs, so a slow provider is recorded as
 *    a provider timeout with its accounting intact rather than as a transport
 *    failure with none.
 * 4. **Nothing sensitive is logged.** The request carries email content and
 *    the response carries evidence spans, so only ids, statuses and durations
 *    are logged — never a body, and never the token.
 */
@Injectable()
export class HttpAiServiceClient implements AiService, OnApplicationShutdown {
  private readonly logger = new Logger(HttpAiServiceClient.name);

  /**
   * One agent for the process: it pools connections, so an analysis does not
   * pay a TCP handshake every time.
   */
  private readonly agent: Agent;

  constructor(@Inject(API_CONFIG) private readonly config: ApiConfig) {
    const { connectTimeoutMs, requestTimeoutMs } = config.aiService;

    this.agent = new Agent({
      connect: { timeout: connectTimeoutMs },
      headersTimeout: requestTimeoutMs,
      bodyTimeout: requestTimeoutMs,
    });
  }

  /**
   * Closes the pooled connections on shutdown.
   *
   * Keep-alive sockets would otherwise hold the event loop open past
   * `app.close()`, making a graceful stop look like a hang.
   */
  async onApplicationShutdown(): Promise<void> {
    await this.agent.close();
  }

  async extract(request: AiExtractRequest): Promise<AiExtractResponse> {
    const { baseUrl, token } = this.config.aiService;
    const url = new URL(AI_EXTRACT_PATH, baseUrl).toString();
    const startedAt = Date.now();

    let status: number;
    let readBody: () => Promise<unknown>;

    try {
      const response = await undiciRequest(url, {
        method: 'POST',
        dispatcher: this.agent,
        headers: {
          'content-type': 'application/json',
          ...(token ? { authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify(request),
      });

      status = response.statusCode;
      readBody = () => response.body.json();
    } catch (error: unknown) {
      throw this.translateTransportError(error);
    }

    this.logger.log(
      `AI service ${AI_EXTRACT_PATH} → ${String(status)} in ${String(Date.now() - startedAt)}ms`,
    );

    if (status >= 400) throw await this.translateErrorResponse(status, readBody);

    return this.parse(await this.readJson(readBody));
  }

  /** Validates the body against the shared contract before it is trusted. */
  private parse(body: unknown): AiExtractResponse {
    const parsed = aiExtractResponseSchema.safeParse(body);

    if (!parsed.success) {
      // Paths only: the body contains the extraction, which is email content.
      const paths = parsed.error.issues
        .slice(0, 10)
        .map((issue) => issue.path.map(String).join('.') || '(root)');
      this.logger.error(`AI service response did not match the contract (${paths.join(', ')})`);

      throw new AiServiceError(
        'invalid_response',
        'The AI service returned a response that did not match the agreed contract.',
      );
    }

    return parsed.data;
  }

  private async readJson(readBody: () => Promise<unknown>): Promise<unknown> {
    try {
      return await readBody();
    } catch (error: unknown) {
      const code = this.errorCode(error);

      if (code && RESPONSE_TIMEOUTS.has(code)) throw this.responseTimeout();

      throw new AiServiceError(
        'invalid_response',
        'The AI service returned a body that could not be read as JSON.',
      );
    }
  }

  /**
   * Maps a non-2xx answer onto a failure code.
   *
   * A `503` is the AI service reporting that it is misconfigured — no email
   * will succeed until an operator acts — so its message is surfaced: the
   * service writes those for operators and keeps content out of them. Every
   * other status is reported generically.
   */
  private async translateErrorResponse(
    status: number,
    readBody: () => Promise<unknown>,
  ): Promise<AiServiceError> {
    const detail = await this.readErrorMessage(readBody);

    if (status === 503) {
      return new AiServiceError(
        'configuration',
        detail ?? 'The AI service reported that it is not configured.',
        true,
      );
    }

    if (status === 401 || status === 403) {
      return new AiServiceError(
        'configuration',
        'The AI service rejected this API instance. Check that AI_SERVICE_TOKEN is the same on both sides.',
        true,
      );
    }

    if (status === 404) {
      return new AiServiceError(
        'configuration',
        `The AI service has no ${AI_EXTRACT_PATH} endpoint. Check AI_SERVICE_URL and the deployed version.`,
        true,
      );
    }

    if (status === 422) {
      // The API built a request the service rejected: the two deployments
      // disagree about the contract. Not a problem with this email.
      return new AiServiceError(
        'invalid_response',
        `The AI service rejected the request as invalid${detail ? `: ${detail}` : ''}.`,
      );
    }

    return new AiServiceError('unavailable', `The AI service returned HTTP ${String(status)}.`);
  }

  /** The service's own operator-facing message, when it sent one. */
  private async readErrorMessage(readBody: () => Promise<unknown>): Promise<string | null> {
    try {
      const parsed = aiServiceErrorSchema.safeParse(await readBody());
      return parsed.success ? parsed.data.message : null;
    } catch {
      return null;
    }
  }

  private translateTransportError(error: unknown): AiServiceError {
    const { baseUrl, connectTimeoutMs } = this.config.aiService;
    const code = this.errorCode(error);

    if (code && RESPONSE_TIMEOUTS.has(code)) return this.responseTimeout();

    if (code === CONNECT_TIMEOUT) {
      this.logger.error(`AI service at ${baseUrl} did not accept a connection`);
      return new AiServiceError(
        'unavailable',
        `Could not connect to the AI service at ${baseUrl} within ${String(connectTimeoutMs)}ms.`,
      );
    }

    // Connection refused, DNS failure, TLS problem: the URL or the deployment
    // is wrong, so the URL is named — it is configuration, not content.
    this.logger.error(`AI service at ${baseUrl} is unreachable${code ? ` (${code})` : ''}`);
    return new AiServiceError('unavailable', `Could not reach the AI service at ${baseUrl}.`);
  }

  private responseTimeout(): AiServiceError {
    const { requestTimeoutMs } = this.config.aiService;
    this.logger.warn(`AI service did not answer within ${String(requestTimeoutMs)}ms`);

    return new AiServiceError(
      'timeout',
      `The AI service did not respond within ${String(requestTimeoutMs)}ms.`,
    );
  }

  private errorCode(error: unknown): string | undefined {
    const code = (error as { code?: unknown } | null)?.code;
    return typeof code === 'string' ? code : undefined;
  }
}
