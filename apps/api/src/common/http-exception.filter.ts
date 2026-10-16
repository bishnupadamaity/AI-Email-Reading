import {
  ArgumentsHost,
  Catch,
  HttpException,
  HttpStatus,
  Logger,
  type ExceptionFilter,
} from '@nestjs/common';
import { type ApiError } from '@email-ai/contracts';
import { type Request, type Response } from 'express';

/**
 * Normalises every error into the shared `ApiError` shape so the front end can
 * rely on one response contract. Unexpected errors are logged with their stack
 * but never leak internals to the client.
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      response.status(status).json(this.toApiError(exception.getResponse(), status));
      return;
    }

    this.logger.error(
      `Unhandled error on ${request.method} ${request.url}`,
      exception instanceof Error ? exception.stack : String(exception),
    );

    response.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
      statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
      message: 'Internal server error',
      error: 'InternalServerError',
    } satisfies ApiError);
  }

  private toApiError(body: string | object, statusCode: number): ApiError | object {
    if (typeof body === 'string') return { statusCode, message: body };
    return body;
  }
}
