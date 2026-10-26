import type { ImageStorage } from '../../lib/storage.ts';
import { BookModel } from '../books/book.model.ts';
import { bookStoragePrefix, PhotoModel } from './photo.model.ts';

const HOUR = 60 * 60 * 1000;
/** Signed upload fields expire after 1 h, so a pending upload older than 2 h is abandoned. */
export const STALE_PENDING_MS = 2 * HOUR;
/** A failed upload the user never retried. */
export const STALE_FAILED_MS = 24 * HOUR;
/**
 * A deleted book is finished only after every upload signature issued for it
 * has expired, so a late upload landing after the first prefix delete is
 * caught by the final one.
 */
export const BOOK_DELETE_GRACE_MS = HOUR;

export interface SweepReport {
  removedPhotos: number;
  removedBooks: number;
  failures: number;
}

/**
 * Finishes work that storage outages or abandoned uploads left behind. Every
 * step is idempotent: it can run again at any time, and a step that fails
 * simply stays for the next run.
 */
export async function sweep(
  storage: ImageStorage,
  namespace: string,
  now = new Date(),
): Promise<SweepReport> {
  const report: SweepReport = { removedPhotos: 0, removedBooks: 0, failures: 0 };
  const before = (ms: number) => new Date(now.getTime() - ms);

  const photos = await PhotoModel.find({
    $or: [
      { status: 'deleting' },
      { status: 'pending', updatedAt: { $lt: before(STALE_PENDING_MS) } },
      { status: 'failed', updatedAt: { $lt: before(STALE_FAILED_MS) } },
    ],
  }).limit(500);

  for (const photo of photos) {
    try {
      await storage.destroy(photo.storage.publicId);
      await PhotoModel.deleteOne({ _id: photo._id, status: photo.status });
      report.removedPhotos++;
    } catch {
      report.failures++;
    }
  }

  const books = await BookModel.find({
    state: 'deleting',
    updatedAt: { $lt: before(BOOK_DELETE_GRACE_MS) },
  }).limit(50);

  for (const book of books) {
    try {
      await storage.destroyPrefix(bookStoragePrefix(namespace, book.userId.toString(), book.id));
      const { deletedCount } = await PhotoModel.deleteMany({ bookId: book._id });
      report.removedPhotos += deletedCount;
      await BookModel.deleteOne({ _id: book._id, state: 'deleting' });
      report.removedBooks++;
    } catch {
      report.failures++;
    }
  }
  return report;
}

/** Runs the sweep now and then every interval. Returns a function that stops it. */
export function startSweeper(
  storage: ImageStorage,
  namespace: string,
  intervalMs = 10 * 60 * 1000,
): () => void {
  const run = () => {
    sweep(storage, namespace).catch((err: unknown) => {
      console.error('Sweep failed:', (err as Error).message);
    });
  };
  run();
  const timer = setInterval(run, intervalMs);
  timer.unref(); // never keeps the process alive on shutdown
  return () => clearInterval(timer);
}
