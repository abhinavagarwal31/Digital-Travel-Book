import {
  captureFields,
  createBookBodySchema,
  isoDateSchema,
  latestThemeVersion,
  setCoverBodySchema,
  setDayLayoutBodySchema,
  setThemeBodySchema,
  tripRangeProblem,
  updateBookBodySchema,
  type CreateBookBody,
  type SetCoverBody,
  type SetDayLayoutBody,
  type SetThemeBody,
  type UpdateBookBody,
} from '@tb/shared';
import express, { type Router } from 'express';
import { AppError } from '../../lib/errors.ts';
import { findOwned, notFound, pathParam } from '../../lib/ownership.ts';
import { validateBody } from '../../lib/validate.ts';
import { authUserId, requireAuth } from '../auth/requireAuth.ts';
import type { ImageStorage } from '../../lib/storage.ts';
import type { SessionConfig } from '../auth/session.ts';
import { timeZoneAt } from '../../lib/timeZoneAt.ts';
import { allowedDays, reorganize } from '../organize/organize.service.ts';
import { bookStoragePrefix, PhotoModel } from '../photos/photo.model.ts';
import { BookModel, toBookDTO } from './book.model.ts';

const ACTIVE = { state: 'active' as const };

export interface BooksRouterConfig extends SessionConfig {
  storage: ImageStorage | null;
  storageNamespace: string;
}

export function createBooksRouter(config: BooksRouterConfig): Router {
  const router = express.Router();
  router.use(requireAuth(config));

  router.post('/', validateBody(createBookBodySchema), async (req, res) => {
    const body = req.body as CreateBookBody;
    const book = await BookModel.create({ ...body, userId: authUserId(req) });
    res.status(201).json({ book: toBookDTO(book) });
  });

  router.get('/', async (req, res) => {
    const books = await BookModel.find({ userId: authUserId(req), ...ACTIVE }).sort({
      updatedAt: -1,
    });
    res.json({ books: books.map(toBookDTO) });
  });

  router.get('/:bookId', async (req, res) => {
    const book = await findOwned(BookModel, pathParam(req, 'bookId'), authUserId(req), ACTIVE);
    res.json({ book: toBookDTO(book) });
  });

  router.patch('/:bookId', validateBody(updateBookBodySchema), async (req, res) => {
    const userId = authUserId(req);
    const changes = req.body as UpdateBookBody;
    const current = await findOwned(BookModel, pathParam(req, 'bookId'), userId, ACTIVE);

    // One end of the range may change alone, so check it against the stored other end.
    const problem = tripRangeProblem(
      changes.startDate ?? current.startDate,
      changes.endDate ?? current.endDate,
    );
    if (problem) {
      throw new AppError(400, 'VALIDATION_FAILED', 'Some fields are invalid', [
        { path: changes.endDate ? 'endDate' : 'startDate', message: problem },
      ]);
    }

    // Targeted $set of only the submitted fields; the document is never replaced.
    const updated = await BookModel.findOneAndUpdate(
      { _id: current._id, userId, ...ACTIVE },
      { $set: changes },
      { returnDocument: 'after', runValidators: true },
    );
    if (!updated) throw notFound();

    // A new default zone re-dates the photos whose time was read in that zone.
    if (changes.defaultTz && changes.defaultTz !== current.defaultTz) {
      const assumed = await PhotoModel.find({
        bookId: updated._id,
        userId,
        status: 'ready',
        timeSource: 'book-default',
      });
      for (const photo of assumed) {
        const fields = captureFields(photo.exif ?? {}, updated, timeZoneAt);
        await PhotoModel.updateOne(
          { _id: photo._id, timeSource: 'book-default' },
          { $set: { capturedAt: fields.capturedAt ? new Date(fields.capturedAt) : null } },
        );
      }
    }

    // New dates or zone change which days photos fall on: re-organise (never
    // moving photos the user placed, never deleting diaries or chapters).
    const datesOrZone = changes.startDate || changes.endDate || changes.defaultTz;
    const book = datesOrZone ? (await reorganize(updated.id, userId)).book : updated;
    res.json({ book: toBookDTO(book) });
  });

  // A book only moves to a newer version of its theme when its owner picks the theme again.
  router.put('/:bookId/theme', validateBody(setThemeBodySchema), async (req, res) => {
    const { id } = req.body as SetThemeBody;
    const book = await findOwned(BookModel, pathParam(req, 'bookId'), authUserId(req), ACTIVE);
    book.theme = { kind: 'preset', id, version: latestThemeVersion(id) };
    await book.save();
    res.json({ book: toBookDTO(book) });
  });

  // Only a photo of this book that has finished uploading can be its cover.
  router.put('/:bookId/cover', validateBody(setCoverBodySchema), async (req, res) => {
    const userId = authUserId(req);
    const { photoId } = req.body as SetCoverBody;
    const book = await findOwned(BookModel, pathParam(req, 'bookId'), userId, ACTIVE);
    if (photoId)
      await findOwned(PhotoModel, photoId, userId, { bookId: book._id, status: 'ready' });
    const updated = await BookModel.findOneAndUpdate(
      { _id: book._id, userId, ...ACTIVE },
      { $set: { 'overrides.coverPhotoId': photoId } },
      { returnDocument: 'after' },
    );
    if (!updated) throw notFound();
    res.json({ book: toBookDTO(updated) });
  });

  router.put(
    '/:bookId/day-layouts/:date',
    validateBody(setDayLayoutBodySchema),
    async (req, res) => {
      const userId = authUserId(req);
      const book = await findOwned(BookModel, pathParam(req, 'bookId'), userId, ACTIVE);
      const date = isoDateSchema.safeParse(pathParam(req, 'date'));
      if (!date.success) throw notFound();
      if (!(await allowedDays(book, userId)).has(date.data)) {
        throw new AppError(400, 'VALIDATION_FAILED', 'That day is not part of this trip', [
          { path: 'date', message: 'Not one of the book’s days' },
        ]);
      }

      // One atomic update, as for diaries: the day's old choice out, the new one in.
      const { layout } = req.body as SetDayLayoutBody;
      const others = {
        $filter: {
          input: { $ifNull: ['$overrides.dayLayouts', []] },
          cond: { $ne: ['$$this.date', date.data] },
        },
      };
      const entries = layout
        ? {
            $concatArrays: [
              others,
              [{ date: { $literal: date.data }, layout: { $literal: layout } }],
            ],
          }
        : others;
      const updated = await BookModel.findOneAndUpdate(
        { _id: book._id, userId, ...ACTIVE },
        [
          {
            $set: {
              'overrides.dayLayouts': { $sortArray: { input: entries, sortBy: { date: 1 } } },
            },
          },
        ],
        { returnDocument: 'after', updatePipeline: true },
      );
      if (!updated) throw notFound();
      res.json({ book: toBookDTO(updated) });
    },
  );

  router.delete('/:bookId', async (req, res) => {
    const userId = authUserId(req);
    const book = await findOwned(BookModel, pathParam(req, 'bookId'), userId, ACTIVE);

    // Hide the book and its photos at once; their hashes are cleared so nothing blocks re-uploads.
    await BookModel.updateOne({ _id: book._id, userId }, { $set: { state: 'deleting' } });
    await PhotoModel.updateMany(
      { bookId: book._id },
      { $set: { status: 'deleting' }, $unset: { contentHash: 1 } },
    );

    // Remove the images and photo records now. The book record itself stays in
    // "deleting" until the sweeper's final pass, an hour later, catches any upload
    // that was still in flight. A storage outage here just leaves more for that pass.
    if (config.storage) {
      try {
        await config.storage.destroyPrefix(
          bookStoragePrefix(config.storageNamespace, userId, book.id),
        );
        await PhotoModel.deleteMany({ bookId: book._id });
      } catch {
        // Left for the sweeper.
      }
    }
    res.status(204).end();
  });

  return router;
}
