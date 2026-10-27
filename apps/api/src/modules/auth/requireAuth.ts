import type { Request, RequestHandler } from 'express';
import { AppError } from '../../lib/errors.ts';
import { clearSession, readSession, SESSION_COOKIE, type SessionConfig } from './session.ts';
import { UserModel } from './user.model.ts';

/**
 * Lets a request through only with a valid session for a user that still
 * exists, from the user's current session version (an older one was signed
 * out). A bad or stale cookie is cleared so the browser stops sending it.
 */
export function requireAuth(config: SessionConfig): RequestHandler {
  return async (req, res, next) => {
    const session = readSession(req, config);
    // Accounts made before versions existed have none stored: that is version 0.
    const current =
      session?.version === 0
        ? { $or: [{ sessionVersion: 0 }, { sessionVersion: { $exists: false } }] }
        : { sessionVersion: session?.version };
    if (session && (await UserModel.exists({ _id: session.userId, ...current }))) {
      req.userId = session.userId;
      next();
      return;
    }
    if (req.cookies?.[SESSION_COOKIE] !== undefined) clearSession(res, config);
    next(new AppError(401, 'UNAUTHENTICATED', 'Please log in'));
  };
}

/** The authenticated user's id inside a route guarded by requireAuth. */
export function authUserId(req: Request): string {
  if (!req.userId) throw new Error('authUserId used on a route without requireAuth');
  return req.userId;
}
