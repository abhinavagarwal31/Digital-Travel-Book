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
import type { SessionConfig } from '../auth/session.ts';
import { BookModel, toBookDTO } from './book.model.ts';

const ACTIVE = { state: 'active' as const };

export function createBooksRouter(config: SessionConfig): Router {
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
    // Mark first so the book disappears from every query at once. Photo and
    // image cleanup joins this sequence in Slice 2; until then nothing else exists.
    await BookModel.updateOne({ _id: book._id, userId }, { $set: { state: 'deleting' } });
    await BookModel.deleteOne({ _id: book._id, userId });
    res.status(204).end();
  });

  return router;
}
