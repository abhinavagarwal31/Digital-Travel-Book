import { apiErrorSchema } from '@tb/shared';
import { z } from 'zod';

const fieldIssuesSchema = z.array(z.object({ path: z.string(), message: z.string() }));
export type FieldIssue = z.infer<typeof fieldIssuesSchema>[number];

/** A failed API call, carrying the server's error code and any per-field problems. */
export class ApiRequestError extends Error {
  readonly status: number;
  readonly code: string;
  readonly fieldIssues: FieldIssue[];

  constructor(status: number, code: string, message: string, fieldIssues: FieldIssue[] = []) {
    super(message);
    this.name = 'ApiRequestError';
    this.status = status;
    this.code = code;
    this.fieldIssues = fieldIssues;
  }
}

interface ApiOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  /** Sent as a JSON body (the API requires JSON on every write). */
  json?: unknown;
}

/**
 * Calls the same-origin API. Cookies travel automatically because the page and
 * the API share an origin. Resolves to undefined for 204 No Content.
 */
export async function apiFetch<T>(path: string, options: ApiOptions = {}): Promise<T> {
  const init: RequestInit = { method: options.method ?? 'GET', credentials: 'same-origin' };
  if (options.json !== undefined) {
    init.headers = { 'Content-Type': 'application/json' };
    init.body = JSON.stringify(options.json);
  }

  const res = await fetch(`/api${path}`, init);
  if (res.status === 204) return undefined as T;
  const body: unknown = await res.json().catch(() => undefined);

  if (!res.ok) {
    const parsed = apiErrorSchema.safeParse(body);
    if (!parsed.success) {
      throw new ApiRequestError(res.status, 'UNKNOWN', `Request failed (${res.status})`);
    }
    const issues = fieldIssuesSchema.safeParse(parsed.data.error.details);
    throw new ApiRequestError(
      res.status,
      parsed.data.error.code,
      parsed.data.error.message,
      issues.success ? issues.data : [],
    );
  }
  return body as T;
}
