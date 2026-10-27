import type { HydratedDocument } from 'mongoose';
import type { ImageStorage } from '../../lib/storage.ts';
import { bookStoragePrefix, PhotoModel } from '../photos/photo.model.ts';
import { BookModel, type BookFields } from './book.model.ts';

/**
 * Deletes a book: it and its photos disappear at once (their hashes are
 * cleared so nothing blocks re-uploads), then the images and photo records
 * are removed. The book record stays in "deleting" until the sweeper's final
 * pass, an hour later, catches any upload that was still in flight; a storage
 * outage here just leaves more for that pass.
 */
export async function deleteBook(
  book: HydratedDocument<BookFields>,
  storage: ImageStorage | null,
  storageNamespace: string,
): Promise<void> {
  const userId = book.userId.toString();
  await BookModel.updateOne({ _id: book._id, userId }, { $set: { state: 'deleting' } });
  await PhotoModel.updateMany(
    { bookId: book._id },
    { $set: { status: 'deleting' }, $unset: { contentHash: 1 } },
  );
  if (storage) {
    try {
      await storage.destroyPrefix(bookStoragePrefix(storageNamespace, userId, book.id));
      await PhotoModel.deleteMany({ bookId: book._id });
    } catch {
      // Left for the sweeper.
    }
  }
}
