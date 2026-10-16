import { BadRequestException, Injectable, type PipeTransform } from '@nestjs/common';
import { type ApiError } from '@email-ai/contracts';
import { type ZodType, type z } from 'zod';

/**
 * Validates and coerces request input with a Zod schema from
 * `@email-ai/contracts`, so the HTTP boundary enforces exactly the shape the
 * rest of the system is typed against.
 *
 * Failures become a 400 carrying per-field `details`; nothing from the schema
 * internals or the stack reaches the client.
 */
@Injectable()
export class ZodValidationPipe<Schema extends ZodType> implements PipeTransform {
  constructor(private readonly schema: Schema) {}

  transform(value: unknown): z.infer<Schema> {
    const result = this.schema.safeParse(value);
    if (result.success) return result.data;

    throw new BadRequestException({
      statusCode: 400,
      message: 'Validation failed',
      error: 'Bad Request',
      details: result.error.issues.map((issue) => ({
        path: issue.path.map(String).join('.') || '(root)',
        message: issue.message,
      })),
    } satisfies ApiError);
  }
}
