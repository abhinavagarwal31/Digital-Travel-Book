import {
  createBookBodySchema,
  tripRangeProblem,
  updateBookBodySchema,
  type CreateBookBody,
  type UpdateBookBody,
} from '@tb/shared';
import express, { type Router } from 'express';
import { AppError } from '../../lib/errors.ts';
import { findOwned, notFound, pathParam } from '../../lib/ownership.ts';
import { validateBody } from '../../lib/validate.ts';
import { authUserId, requireAuth } from '../auth/requireAuth.ts';
import type { ImageStorage } from '../../lib/storage.ts';
import type { SessionConfig } from '../auth/session.ts';
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
    res.json({ book: toBookDTO(updated) });
  });

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
