import type { RequestHandler } from 'express';
import { sendError } from './errors.ts';

const BODY_METHODS = new Set(['POST', 'PUT', 'PATCH']);

/**
 * CSRF hardening on top of SameSite=Lax cookies: requests that change data must
 * declare a JSON body. HTML forms can only send urlencoded, multipart or
 * text/plain bodies, and a cross-site fetch with a JSON content type triggers a
 * CORS preflight this API never approves. Clients send `{}` when there is no body.
 * DELETE is exempt because forms cannot send it.
 */
export const requireJsonForWrites: RequestHandler = (req, res, next) => {
  if (BODY_METHODS.has(req.method) && !req.is('application/json')) {
    sendError(res, 415, 'UNSUPPORTED_MEDIA_TYPE', 'Requests that change data must send JSON');
    return;
  }
  next();
};
