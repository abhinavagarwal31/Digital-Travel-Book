import {
  captureFields,
  chaptersBodySchema,
  daySet,
  locationBodySchema,
  photoIdsBodySchema,
  setDayBodySchema,
  timeBodySchema,
  visibilityBodySchema,
  zonedWallClockToUtc,
  isValidGps,
  type ChaptersBody,
  type LocationBody,
  type SetDayBody,
  type TimeBody,
  type VisibilityBody,
} from '@tb/shared';
import express, { type Request, type Router } from 'express';
import type { HydratedDocument } from 'mongoose';
import { AppError } from '../../lib/errors.ts';
import { findOwned, notFound, pathParam } from '../../lib/ownership.ts';
import { timeZoneAt } from '../../lib/timeZoneAt.ts';
import { validateBody } from '../../lib/validate.ts';
import { authUserId, requireAuth } from '../auth/requireAuth.ts';
import type { SessionConfig } from '../auth/session.ts';
import { BookModel, toBookDTO, type BookFields } from '../books/book.model.ts';
import { PhotoModel } from '../photos/photo.model.ts';
import { diaryDates, reorganize, toOrganizable } from './organize.service.ts';

const ACTIVE = { state: 'active' as const };

async function respond(res: express.Response, bookId: string, userId: string) {
  const { book, summary } = await reorganize(bookId, userId);
  res.json({ book: toBookDTO(book), summary });
}

/** The caller's book and exactly the listed ready photos in it, or a 404 for all of them. */
async function ownedPhotos(req: Request, photoIds: string[]) {
  const userId = authUserId(req);
  const book = await findOwned(BookModel, pathParam(req, 'bookId'), userId, ACTIVE);
  const photos = await PhotoModel.find({
    _id: { $in: photoIds },
    bookId: book._id,
    userId,
    status: 'ready',
  });
  // All or nothing: one foreign, missing or unfinished id rejects the whole request.
  if (photos.length !== photoIds.length) throw notFound();
  return { userId, book, photos };
}

async function allowedDays(book: HydratedDocument<BookFields>, userId: string) {
  const photos = await PhotoModel.find({ bookId: book._id, userId, status: 'ready' });
  return new Set(
    daySet(
      {
        startDate: book.startDate,
        endDate: book.endDate,
        diaryDates: diaryDates(book),
        chapters: book.chapters,
      },
      photos.map(toOrganizable),
    ),
  );
}

export function createOrganizeRouter(config: SessionConfig): Router {
  const router = express.Router();
  const auth = requireAuth(config);

  router.post('/books/:bookId/organize', auth, async (req, res) => {
    const userId = authUserId(req);
    const book = await findOwned(BookModel, pathParam(req, 'bookId'), userId, ACTIVE);
    await respond(res, book.id, userId);
  });

  /** Move photos to a day, or deliberately to no day. A user decision: organisation never undoes it. */
  router.put(
    '/books/:bookId/photos/day',
    auth,
    validateBody(setDayBodySchema),
    async (req, res) => {
      const body = req.body as SetDayBody;
      const { userId, book, photos } = await ownedPhotos(req, body.photoIds);

      if (body.dayDate !== null && !(await allowedDays(book, userId)).has(body.dayDate)) {
        throw new AppError(400, 'VALIDATION_FAILED', 'That day is not part of this trip', [
          { path: 'dayDate', message: 'Not one of the book’s days' },
        ]);
      }

      if (body.expect) {
        const changed = photos
          .filter((p) => {
            const expected = body.expect?.[p.id];
            return (
              expected && (expected.dayDate !== p.dayDate || expected.assignedBy !== p.assignedBy)
            );
          })
          .map((p) => p.id);
        if (changed.length > 0) {
          throw new AppError(409, 'CONFLICT', 'These photos changed since you last saw them', {
            photoIds: changed,
          });
        }
      }

      await PhotoModel.updateMany(
        { _id: { $in: body.photoIds }, bookId: book._id, userId, status: 'ready' },
        { $set: { dayDate: body.dayDate, assignedBy: 'user' } },
      );
      await respond(res, book.id, userId);
    },
  );

  /** Hand photos back to automatic placement (their day comes from their own time again). */
  router.post(
    '/books/:bookId/photos/day-reset',
    auth,
    validateBody(photoIdsBodySchema),
    async (req, res) => {
      const { photoIds } = req.body as { photoIds: string[] };
      const { userId, book } = await ownedPhotos(req, photoIds);
      await PhotoModel.updateMany(
        { _id: { $in: photoIds }, bookId: book._id, userId },
        { $set: { assignedBy: 'auto' } },
      );
      await respond(res, book.id, userId);
    },
  );

  /** Exclude photos from the book, or bring them back. Nothing else about them changes. */
  router.put(
    '/books/:bookId/photos/visibility',
    auth,
    validateBody(visibilityBodySchema),
    async (req, res) => {
      const body = req.body as VisibilityBody;
      const { userId, book } = await ownedPhotos(req, body.photoIds);
      await PhotoModel.updateMany(
        { _id: { $in: body.photoIds }, bookId: book._id, userId },
        { $set: { hidden: body.hidden } },
      );
      await respond(res, book.id, userId);
    },
  );

  /** The user confirms, removes or restores a photo's GPS position. Raw EXIF is never touched. */
  router.put(
    '/photos/:photoId/location',
    auth,
    validateBody(locationBodySchema),
    async (req, res) => {
      const userId = authUserId(req);
      const photo = await findOwned(PhotoModel, pathParam(req, 'photoId'), userId, {
        status: 'ready',
      });
      const { action } = req.body as LocationBody;

      if (action === 'confirm') {
        if (!photo.gps) {
          throw new AppError(400, 'NO_LOCATION', 'This photo has no location to confirm');
        }
        photo.gpsStatus = 'confirmed';
      } else if (action === 'remove') {
        photo.gps = null;
        photo.gpsStatus = 'removed';
      } else {
        const { lat, lng } = photo.exif ?? {};
        const valid = isValidGps(lat, lng);
        photo.gps = valid ? { lat: lat as number, lng: lng as number } : null;
        photo.gpsStatus = valid ? 'exif' : null;
      }
      await photo.save();
      await respond(res, photo.bookId.toString(), userId);
    },
  );

  /**
   * The user sets a photo's local time and zone, or resets to what the file
   * said. Either way the photo's day follows its time again (assignedBy: auto):
   * correcting the time is the newer, more specific decision.
   */
  router.put('/photos/:photoId/time', auth, validateBody(timeBodySchema), async (req, res) => {
    const userId = authUserId(req);
    const photo = await findOwned(PhotoModel, pathParam(req, 'photoId'), userId, {
      status: 'ready',
    });
    const book = await findOwned(BookModel, photo.bookId.toString(), userId, ACTIVE);
    const body = req.body as TimeBody;
    const ownFlags = photo.flags.filter((f) => f !== 'no_time' && f !== 'tz_assumed');

    if ('reset' in body) {
      const fields = captureFields(photo.exif ?? {}, book, timeZoneAt);
      photo.capturedAt = fields.capturedAt ? new Date(fields.capturedAt) : null;
      photo.localDateTime = fields.localDateTime;
      photo.timeSource = fields.timeSource;
      photo.flags = [...ownFlags, ...fields.flags.filter((f) => f !== 'outside_trip')];
    } else {
      const utc = zonedWallClockToUtc(body.localDateTime, body.timeZone);
      if (!utc) throw new AppError(400, 'VALIDATION_FAILED', 'Unknown time zone');
      photo.capturedAt = new Date(utc.ms);
      photo.localDateTime = body.localDateTime;
      photo.timeSource = 'user';
      photo.flags = ownFlags;
    }
    photo.assignedBy = 'auto';
    await photo.save();
    await respond(res, book.id, userId);
  });

  /**
   * Saves the user's chapters (renamed, merged, split or reordered). From now on
   * chapters are never re-suggested; organisation only places days that are in
   * no chapter, next to their neighbours.
   */
  router.put(
    '/books/:bookId/chapters',
    auth,
    validateBody(chaptersBodySchema),
    async (req, res) => {
      const userId = authUserId(req);
      const book = await findOwned(BookModel, pathParam(req, 'bookId'), userId, ACTIVE);
      const { chapters } = req.body as ChaptersBody;
      const allowed = await allowedDays(book, userId);
      const unknown = chapters.flatMap((c) => c.dayDates).filter((d) => !allowed.has(d));
      if (unknown.length > 0) {
        throw new AppError(400, 'VALIDATION_FAILED', 'Some days are not part of this trip', [
          { path: 'chapters', message: `Unknown days: ${unknown.join(', ')}` },
        ]);
      }
      await BookModel.updateOne(
        { _id: book._id, userId, ...ACTIVE },
        { $set: { chapters, chaptersEdited: true } },
      );
      await respond(res, book.id, userId);
    },
  );

  return router;
}
