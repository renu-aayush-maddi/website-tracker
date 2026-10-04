import type { z } from 'zod';

/** Parses untrusted input; a ZodError becomes a 400 response with field messages. */
export function parse<S extends z.ZodType>(schema: S, data: unknown): z.output<S> {
  return schema.parse(data);
}
