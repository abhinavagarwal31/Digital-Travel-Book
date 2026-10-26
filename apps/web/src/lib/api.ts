import { apiErrorSchema, healthResponseSchema, type HealthResponse } from '@tb/shared';

/** A failed API call, carrying the server's error code when it sent one. */
export class ApiRequestError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = 'ApiRequestError';
    this.status = status;
    this.code = code;
  }
}

/**
 * Calls the same-origin API. Cookies travel automatically because the page and
 * the API share an origin; JSON bodies get the content type the API requires.
 */
export async function apiFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  if (init.body !== undefined && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  const res = await fetch(`/api${path}`, { ...init, headers, credentials: 'same-origin' });
  const body: unknown = await res.json().catch(() => undefined);

  if (!res.ok) {
    const parsed = apiErrorSchema.safeParse(body);
    throw parsed.success
      ? new ApiRequestError(res.status, parsed.data.error.code, parsed.data.error.message)
      : new ApiRequestError(res.status, 'UNKNOWN', `Request failed with status ${res.status}`);
  }
  return body as T;
}

/** Health is read directly: a 503 still carries a valid "degraded" body. */
export async function getHealth(): Promise<HealthResponse> {
  const res = await fetch('/api/health', { credentials: 'same-origin' });
  const parsed = healthResponseSchema.safeParse(await res.json().catch(() => undefined));
  if (!parsed.success) {
    throw new ApiRequestError(res.status, 'UNKNOWN', 'Unexpected health response');
  }
  return parsed.data;
}
