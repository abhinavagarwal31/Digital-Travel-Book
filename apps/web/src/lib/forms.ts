import type { z } from 'zod';
import { ApiRequestError } from './api.ts';

/** Field name → first problem with it. */
export type FieldErrors = Partial<Record<string, string>>;

export function zodFieldErrors(error: z.ZodError): FieldErrors {
  const errors: FieldErrors = {};
  for (const issue of error.issues) {
    const field = String(issue.path[0] ?? 'form');
    errors[field] ??= issue.message;
  }
  return errors;
}

/** Splits a failed request into per-field messages and one message for the form. */
export function apiErrors(err: unknown): { fields: FieldErrors; form: string | null } {
  if (!(err instanceof ApiRequestError)) {
    return { fields: {}, form: 'Could not reach the server. Check your connection and try again.' };
  }
  const fields: FieldErrors = {};
  for (const issue of err.fieldIssues) fields[issue.path] ??= issue.message;
  return { fields, form: err.fieldIssues.length > 0 ? null : err.message };
}
