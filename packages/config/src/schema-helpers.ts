import { z } from 'zod';

/**
 * Helpers for reading `process.env`, where every value is a string.
 *
 * Note on defaults: in Zod 4 `.default()` supplies the *output* value when the
 * input is `undefined`, so the defaults below are typed values rather than the
 * strings a shell would provide.
 */

/** `"true" | "1" | "yes" | "on"` → `true`; `"false" | "0" | "no" | "off"` → `false`. */
export const booleanFromEnv = (defaultValue: boolean) =>
  z
    .string()
    .trim()
    .transform((value, ctx) => {
      // An explicitly empty variable is treated as "unset".
      if (value === '') return defaultValue;

      const normalised = value.toLowerCase();
      if (['true', '1', 'yes', 'on'].includes(normalised)) return true;
      if (['false', '0', 'no', 'off'].includes(normalised)) return false;

      ctx.addIssue({ code: 'custom', message: `expected a boolean, received "${value}"` });
      return z.NEVER;
    })
    .default(defaultValue);

/** A TCP port. */
export const portFromEnv = (defaultValue: number) =>
  z.coerce.number().int().min(1).max(65_535).default(defaultValue);

/** An integer at or above `min`. */
export const intFromEnv = (defaultValue: number, min = 0) =>
  z.coerce.number().int().min(min).default(defaultValue);

/** `"a, b ,c"` → `['a', 'b', 'c']`, dropping empty entries. */
export const csvFromEnv = (defaultValue: readonly string[] = []) =>
  z
    .string()
    .trim()
    .transform((value) =>
      value
        .split(',')
        .map((entry) => entry.trim())
        .filter((entry) => entry.length > 0),
    )
    .default([...defaultValue]);

export const nodeEnvSchema = z.enum(['development', 'test', 'production']).default('development');

export type NodeEnv = z.infer<typeof nodeEnvSchema>;
