import type { CookieOptions, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import mongoose from 'mongoose';

export const SESSION_COOKIE = 'tb_session';
export const SESSION_TTL_SECONDS = 7 * 24 * 60 * 60;

export interface SessionConfig {
  jwtSecret: string;
  /** True in production (HTTPS); browsers drop Secure cookies on plain http://localhost. */
  cookieSecure: boolean;
}

function cookieOptions(config: SessionConfig): CookieOptions {
  return { httpOnly: true, sameSite: 'lax', secure: config.cookieSecure, path: '/' };
}

/** Signs a session for the user and sets it as an HttpOnly cookie. */
export function issueSession(res: Response, userId: string, config: SessionConfig): void {
  const token = jwt.sign({}, config.jwtSecret, {
    algorithm: 'HS256',
    subject: userId,
    expiresIn: SESSION_TTL_SECONDS,
  });
  res.cookie(SESSION_COOKIE, token, {
    ...cookieOptions(config),
    maxAge: SESSION_TTL_SECONDS * 1000,
  });
}

export function clearSession(res: Response, config: SessionConfig): void {
  res.clearCookie(SESSION_COOKIE, cookieOptions(config));
}

/**
 * The user id from a valid session cookie, or null. Only HS256 with our secret
 * is accepted, so unsigned ("alg: none") or re-signed tokens fail, as do expired ones.
 */
export function readSessionUserId(req: Request, config: SessionConfig): string | null {
  const token: unknown = req.cookies?.[SESSION_COOKIE];
  if (typeof token !== 'string' || token === '') return null;
  try {
    const payload = jwt.verify(token, config.jwtSecret, { algorithms: ['HS256'] });
    const sub = typeof payload === 'object' ? payload.sub : undefined;
    return typeof sub === 'string' && mongoose.isValidObjectId(sub) ? sub : null;
  } catch {
    return null;
  }
}
