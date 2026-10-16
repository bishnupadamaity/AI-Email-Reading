import { type SchemaObject } from '@nestjs/swagger';
import { z, type ZodType } from 'zod';

/**
 * Derives an OpenAPI schema from a Zod schema so the documentation cannot drift
 * from the validation that actually runs.
 *
 * `io` selects which side of the schema to describe: `'input'` reflects what a
 * client may send (defaults applied, coercions allowed), `'output'` what the
 * API returns.
 */
export function openApiSchema(schema: ZodType, io: 'input' | 'output' = 'output'): SchemaObject {
  const jsonSchema = z.toJSONSchema(schema, { io, target: 'draft-7', unrepresentable: 'any' });

  // Swagger merges this into its own document, which carries the dialect.
  delete (jsonSchema as Record<string, unknown>)['$schema'];
  return jsonSchema as SchemaObject;
}

/** Wraps an item schema in the shared pagination envelope for documentation. */
export function openApiPaginated(item: ZodType): SchemaObject {
  return {
    type: 'object',
    properties: {
      items: { type: 'array', items: openApiSchema(item) },
      page: { type: 'integer', example: 1 },
      pageSize: { type: 'integer', example: 25 },
      total: { type: 'integer', example: 42 },
    },
    required: ['items', 'page', 'pageSize', 'total'],
  };
}
