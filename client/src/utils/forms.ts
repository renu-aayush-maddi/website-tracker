import type { z } from 'zod';
import { ApiError } from '../services/api';

/** Adapts a shared zod schema to Mantine form validation (dot-path errors). */
export function zodValidate<S extends z.ZodType>(schema: S) {
  return (values: unknown): Record<string, string> => {
    const result = schema.safeParse(values);
    if (result.success) return {};
    const errors: Record<string, string> = {};
    for (const issue of result.error.issues) {
      const key = issue.path.map(String).join('.');
      errors[key] ??= issue.code === 'invalid_type' ? 'Required' : issue.message;
    }
    return errors;
  };
}

/** Field errors from a 400 response, for form.setErrors(). */
export function serverFieldErrors(error: unknown): Record<string, string> | null {
  return error instanceof ApiError && error.fields ? error.fields : null;
}
