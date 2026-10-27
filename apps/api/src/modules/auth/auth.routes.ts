import { loginBodySchema, registerBodySchema, type LoginBody, type RegisterBody } from '@tb/shared';
import express, { type Router } from 'express';
import rateLimit from 'express-rate-limit';
import mongoose from 'mongoose';
import { AppError, sendError } from '../../lib/errors.ts';
import { DUMMY_HASH, hashPassword, verifyPassword } from '../../lib/password.ts';
import { validateBody } from '../../lib/validate.ts';
import { authUserId, requireAuth } from './requireAuth.ts';
import { clearSession, issueSession, type SessionConfig } from './session.ts';
import { toUserDTO, UserModel } from './user.model.ts';

export interface AuthRateLimit {
  windowMs: number;
  limit: number;
}

export interface AuthRouterConfig extends SessionConfig {
  authRateLimit: AuthRateLimit;
}

function isDuplicateKeyError(err: unknown): boolean {
  return err instanceof mongoose.mongo.MongoServerError && err.code === 11000;
}

export function createAuthRouter(config: AuthRouterConfig): Router {
  const router = express.Router();

  // Per client IP (req.ip honours `trust proxy`), shared by register and login.
  const attemptLimiter = rateLimit({
    windowMs: config.authRateLimit.windowMs,
    limit: config.authRateLimit.limit,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    handler: (_req, res) => {
      sendError(res, 429, 'RATE_LIMITED', 'Too many attempts. Try again in a few minutes.');
    },
  });

  router.post('/register', attemptLimiter, validateBody(registerBodySchema), async (req, res) => {
    const { name, email, password } = req.body as RegisterBody;
    const passwordHash = await hashPassword(password);
    try {
      const user = await UserModel.create({ name, email, passwordHash });
      issueSession(res, user.id, config, user.sessionVersion);
      res.status(201).json({ user: toUserDTO(user) });
    } catch (err) {
      if (isDuplicateKeyError(err)) {
        throw new AppError(409, 'EMAIL_TAKEN', 'An account with this email already exists');
      }
      throw err;
    }
  });

  router.post('/login', attemptLimiter, validateBody(loginBodySchema), async (req, res) => {
    const { email, password } = req.body as LoginBody;
    const user = await UserModel.findOne({ email }).select('+passwordHash');
    // Hash even when the email is unknown, so timing does not reveal which accounts exist.
    const valid = await verifyPassword(password, user?.passwordHash ?? DUMMY_HASH);
    if (!user || !valid) {
      throw new AppError(401, 'INVALID_CREDENTIALS', 'Email or password is incorrect');
    }
    issueSession(res, user.id, config, user.sessionVersion ?? 0);
    res.json({ user: toUserDTO(user) });
  });

  // Stateless JWTs cannot be revoked server-side; logout removes the cookie from
  // this browser. A copied token stays valid until it expires (7 days).
  router.post('/logout', (_req, res) => {
    clearSession(res, config);
    res.status(204).end();
  });

  router.get('/me', requireAuth(config), async (req, res) => {
    const user = await UserModel.findById(authUserId(req));
    if (!user) throw new AppError(401, 'UNAUTHENTICATED', 'Please log in');
    res.json({ user: toUserDTO(user) });
  });

  return router;
}
