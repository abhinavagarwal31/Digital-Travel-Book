import {
  changePasswordBodySchema,
  deleteAccountBodySchema,
  photoLimit,
  travelPath,
  updateAccountBodySchema,
  type Account,
  type ChangePasswordBody,
  type DeleteAccountBody,
  type TripPath,
  type UpdateAccountBody,
} from '@tb/shared';
import express, { type Router } from 'express';
import rateLimit from 'express-rate-limit';
import mongoose, { type HydratedDocument } from 'mongoose';
import { AppError, sendError } from '../../lib/errors.ts';
import { hashPassword, verifyPassword } from '../../lib/password.ts';
import type { ImageStorage } from '../../lib/storage.ts';
import { validateBody } from '../../lib/validate.ts';
import type { AuthRateLimit } from '../auth/auth.routes.ts';
import { authUserId, requireAuth } from '../auth/requireAuth.ts';
import { clearSession, issueSession, type SessionConfig } from '../auth/session.ts';
import { toUserDTO, UserModel, type UserFields } from '../auth/user.model.ts';
import { BookModel } from '../books/book.model.ts';
import { deleteBook } from '../books/book.service.ts';
import { PhotoModel } from '../photos/photo.model.ts';

export interface AccountRouterConfig extends SessionConfig {
  authRateLimit: AuthRateLimit;
  storage: ImageStorage | null;
  storageNamespace: string;
}

const ACTIVE = { state: 'active' as const };

function isDuplicateKeyError(err: unknown): boolean {
  return err instanceof mongoose.mongo.MongoServerError && err.code === 11000;
}

/** The account with its plan and how much of it is used. */
async function accountOf(user: HydratedDocument<UserFields>): Promise<Account> {
  const books = await BookModel.find({ userId: user._id, ...ACTIVE }).select('title');
  const counts = await PhotoModel.aggregate<{ _id: mongoose.Types.ObjectId; photos: number }>([
    {
      $match: {
        userId: user._id,
        bookId: { $in: books.map((b) => b._id) },
        status: { $ne: 'deleting' },
      },
    },
    { $group: { _id: '$bookId', photos: { $sum: 1 } } },
    { $sort: { photos: -1, _id: 1 } },
  ]);
  const fullest = counts[0];
  const fullestBook = fullest ? books.find((b) => b._id.equals(fullest._id)) : undefined;
  return {
    user: toUserDTO(user),
    plan: user.plan,
    photoLimit: photoLimit(user.plan),
    usage: {
      books: books.length,
      photos: counts.reduce((n, c) => n + c.photos, 0),
      fullestBook:
        fullest && fullestBook
          ? { id: fullestBook.id, title: fullestBook.title, photos: fullest.photos }
          : null,
    },
  };
}

/**
 * The signed-in user's own account: details, password, plan and usage, and
 * deleting it all. Every change that needs the password is rate-limited like
 * logging in, so this page cannot be used to guess it.
 */
export function createAccountRouter(config: AccountRouterConfig): Router {
  const router = express.Router();
  router.use(requireAuth(config));

  const passwordAttempts = rateLimit({
    windowMs: config.authRateLimit.windowMs,
    limit: config.authRateLimit.limit,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    handler: (_req, res) => {
      sendError(res, 429, 'RATE_LIMITED', 'Too many attempts. Try again in a few minutes.');
    },
  });

  const me = async (userId: string, withPassword = false) => {
    const query = UserModel.findById(userId);
    const user = await (withPassword ? query.select('+passwordHash') : query);
    if (!user) throw new AppError(401, 'UNAUTHENTICATED', 'Please log in');
    return user;
  };

  const checkPassword = async (
    user: HydratedDocument<UserFields>,
    password: string,
    field: string,
  ) => {
    if (!(await verifyPassword(password, user.passwordHash))) {
      throw new AppError(400, 'VALIDATION_FAILED', 'Some fields are invalid', [
        { path: field, message: 'That password is not right' },
      ]);
    }
  };

  router.get('/', async (req, res) => {
    res.json({ account: await accountOf(await me(authUserId(req))) });
  });

  /**
   * Every place the account's trips have reached, for the world map: per
   * book, its located photos in time order, merged into places. Locations the
   * owner removed, and suspicious ones not yet confirmed, are left out, as on
   * the book's own maps.
   */
  router.get('/places', async (req, res) => {
    const userId = authUserId(req);
    const books = await BookModel.find({ userId, ...ACTIVE })
      .sort({ startDate: 1 })
      .select('title startDate');
    const photos = await PhotoModel.find({
      userId,
      bookId: { $in: books.map((b) => b._id) },
      status: 'ready',
      hidden: false,
      gps: { $ne: null },
      capturedAt: { $ne: null },
      gpsStatus: { $ne: 'removed' },
    })
      .sort({ capturedAt: 1, _id: 1 })
      .select('bookId gps gpsStatus flags');
    const trips: TripPath[] = books.flatMap((book) => {
      const located = photos
        .filter((p) => p.bookId.equals(book._id))
        .filter((p) => !p.flags.includes('gps_outlier') || p.gpsStatus === 'confirmed')
        .map((p) => ({ lat: p.gps?.lat as number, lng: p.gps?.lng as number }));
      const points = travelPath(located);
      return points.length > 0
        ? [{ bookId: book.id, title: book.title, startDate: book.startDate, points }]
        : [];
    });
    res.json({ trips });
  });

  router.patch('/', passwordAttempts, validateBody(updateAccountBodySchema), async (req, res) => {
    const { name, email, currentPassword } = req.body as UpdateAccountBody;
    const user = await me(authUserId(req), email !== undefined);
    if (email !== undefined && email !== user.email) {
      await checkPassword(user, currentPassword ?? '', 'currentPassword');
      user.email = email;
    }
    if (name !== undefined) user.name = name;
    try {
      await user.save();
    } catch (err) {
      if (isDuplicateKeyError(err)) {
        throw new AppError(409, 'EMAIL_TAKEN', 'An account with this email already exists');
      }
      throw err;
    }
    res.json({ account: await accountOf(user) });
  });

  // A new password signs out every other device; this one gets a fresh session.
  router.put(
    '/password',
    passwordAttempts,
    validateBody(changePasswordBodySchema),
    async (req, res) => {
      const { currentPassword, newPassword } = req.body as ChangePasswordBody;
      const user = await me(authUserId(req), true);
      await checkPassword(user, currentPassword, 'currentPassword');
      user.passwordHash = await hashPassword(newPassword);
      user.sessionVersion = (user.sessionVersion ?? 0) + 1;
      await user.save();
      issueSession(res, user.id, config, user.sessionVersion);
      res.status(204).end();
    },
  );

  router.post('/sessions/sign-out-others', async (req, res) => {
    const user = await me(authUserId(req));
    user.sessionVersion = (user.sessionVersion ?? 0) + 1;
    await user.save();
    issueSession(res, user.id, config, user.sessionVersion);
    res.status(204).end();
  });

  // Everything goes: every book (and its photos and images), then the account.
  router.delete('/', passwordAttempts, validateBody(deleteAccountBodySchema), async (req, res) => {
    const { password } = req.body as DeleteAccountBody;
    const user = await me(authUserId(req), true);
    await checkPassword(user, password, 'password');
    for (const book of await BookModel.find({ userId: user._id, ...ACTIVE })) {
      await deleteBook(book, config.storage, config.storageNamespace);
    }
    await UserModel.deleteOne({ _id: user._id });
    clearSession(res, config);
    res.status(204).end();
  });

  return router;
}
