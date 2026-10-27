import {
  captionBodySchema,
  diaryBodySchema,
  isoDateSchema,
  type CaptionBody,
  type DiaryBody,
} from '@tb/shared';
import express, { type Router } from 'express';
import { AppError } from '../../lib/errors.ts';
import { findOwned, notFound, pathParam } from '../../lib/ownership.ts';
import { validateBody } from '../../lib/validate.ts';
import { authUserId, requireAuth } from '../auth/requireAuth.ts';
import type { SessionConfig } from '../auth/session.ts';
import { BookModel, toBookDTO } from '../books/book.model.ts';
import { allowedDays, reorganize } from '../organize/organize.service.ts';
import { PhotoModel, toPhotoDTO } from '../photos/photo.model.ts';

const ACTIVE = { state: 'active' as const };

/**
 * The words in the book: a caption under each photo and a diary entry for each
 * day. The editor autosaves, so both are idempotent "set to this text" writes.
 */
export function createJournalRouter(config: SessionConfig): Router {
  const router = express.Router();
  const auth = requireAuth(config);

  router.put(
    '/photos/:photoId/caption',
    auth,
    validateBody(captionBodySchema),
    async (req, res) => {
      const userId = authUserId(req);
      const photo = await findOwned(PhotoModel, pathParam(req, 'photoId'), userId, {
        status: 'ready',
      });
      const { caption } = req.body as CaptionBody;
      const updated = await PhotoModel.findOneAndUpdate(
        { _id: photo._id, userId, status: 'ready' },
        { $set: { caption } },
        { returnDocument: 'after' },
      );
      if (!updated) throw notFound();
      res.json({ photo: toPhotoDTO(updated) });
    },
  );

  /**
   * Sets one day's diary entry; empty text removes it. Only a day of the book
   * can have one, and adding an entry can add a day to a chapter, so the
   * answer is the reorganised book.
   */
  router.put(
    '/books/:bookId/days/:date/diary',
    auth,
    validateBody(diaryBodySchema),
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

      const { diary } = req.body as DiaryBody;
      // One atomic pipeline update: drop the day's old entry, add the new one
      // (unless it is empty) and keep entries in date order. Saves racing for
      // the same day can never leave two entries. User text goes in as a
      // $literal: in a pipeline, "$days" would otherwise be read as a field.
      // Books saved before diaries existed have no days array: treat it as empty.
      const others = {
        $filter: { input: { $ifNull: ['$days', []] }, cond: { $ne: ['$$this.date', date.data] } },
      };
      const entries =
        diary === ''
          ? others
          : {
              $concatArrays: [
                others,
                [{ date: { $literal: date.data }, diary: { $literal: diary } }],
              ],
            };
      await BookModel.updateOne(
        { _id: book._id, userId, ...ACTIVE },
        [{ $set: { days: { $sortArray: { input: entries, sortBy: { date: 1 } } } } }],
        { updatePipeline: true },
      );

      const result = await reorganize(book.id, userId);
      res.json({ book: toBookDTO(result.book), summary: result.summary });
    },
  );

  return router;
}
