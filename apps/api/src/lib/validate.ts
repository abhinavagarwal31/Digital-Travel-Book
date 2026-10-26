import type { RequestHandler } from 'express';
import type { z } from 'zod';
import { AppError } from './errors.ts';

/**
 * Replaces req.body with the parsed (trimmed, normalized) value, or answers 400
 * with each failing field. Details carry paths and messages only, never the
 * submitted values, so a mistyped password is not echoed back.
 */
export function validateBody(schema: z.ZodType): RequestHandler {
  return (req, _res, next) => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      const details = result.error.issues.map((issue) => ({
        path: issue.path.join('.'),
        message: issue.message,
      }));
      next(new AppError(400, 'VALIDATION_FAILED', 'Some fields are invalid', details));
      return;
    }
    req.body = result.data;
    next();
  };
}
