import type { ErrorRequestHandler, RequestHandler, Response } from 'express';
import type { ApiError } from '@tb/shared';

/** An expected failure whose code and message are safe to show the client. */
export class AppError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details: unknown;

  constructor(status: number, code: string, message: string, details?: unknown) {
    super(message);
    this.name = 'AppError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export function sendError(
  res: Response,
  status: number,
  code: string,
  message: string,
  details?: unknown,
): void {
  const body: ApiError = { error: { code, message } };
  if (details !== undefined) body.error.details = details;
  res.status(status).json(body);
}

/** Fallback for any /api route that matched nothing. */
export const apiNotFound: RequestHandler = (_req, res) => {
  sendError(res, 404, 'NOT_FOUND', 'Not found');
};

type BodyParserError = Error & { type?: string };

/**
 * Turns every thrown error into the standard error envelope. Unexpected errors
 * are logged in full on the server and reach the client only as a generic 500,
 * so stack traces and internal details never leave the process.
 */
export const errorHandler: ErrorRequestHandler = (err: unknown, _req, res, next) => {
  if (res.headersSent) {
    next(err);
    return;
  }

  if (err instanceof AppError) {
    sendError(res, err.status, err.code, err.message, err.details);
    return;
  }

  const parserType = (err as BodyParserError | null)?.type;
  if (parserType === 'entity.parse.failed') {
    sendError(res, 400, 'INVALID_JSON', 'Request body is not valid JSON');
    return;
  }
  if (parserType === 'entity.too.large') {
    sendError(res, 413, 'PAYLOAD_TOO_LARGE', 'Request body is too large');
    return;
  }

  console.error('Unhandled error:', err);
  sendError(res, 500, 'INTERNAL_ERROR', 'Something went wrong');
};
