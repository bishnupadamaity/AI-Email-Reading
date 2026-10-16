import { z } from 'zod';

/** Identifier shape used by every persisted resource. */
export const idSchema = z.uuid();
export type Id = z.infer<typeof idSchema>;

/** ISO-8601 timestamp, always serialised as a string over the wire. */
export const isoTimestampSchema = z.iso.datetime({ offset: true });
export type IsoTimestamp = z.infer<typeof isoTimestampSchema>;

/** Query parameters for every list endpoint. */
export const paginationQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
});
export type PaginationQuery = z.infer<typeof paginationQuerySchema>;

/** Wraps an item schema into the standard list envelope. */
export const paginatedSchema = <Item extends z.ZodType>(item: Item) =>
  z.object({
    items: z.array(item),
    page: z.number().int().min(1),
    pageSize: z.number().int().min(1),
    total: z.number().int().min(0),
  });

export interface Paginated<Item> {
  items: Item[];
  page: number;
  pageSize: number;
  total: number;
}

/** Error body returned by the API for any non-2xx response. */
export const apiErrorSchema = z.object({
  statusCode: z.number().int(),
  message: z.string(),
  error: z.string().optional(),
  /** Per-field problems, present on validation failures only. */
  details: z.array(z.object({ path: z.string(), message: z.string() })).optional(),
});
export type ApiError = z.infer<typeof apiErrorSchema>;
