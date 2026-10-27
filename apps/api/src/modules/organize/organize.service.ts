import {
  daySet,
  organize,
  sortingSummary,
  type OrganizablePhoto,
  type SortingSummary,
} from '@tb/shared';
import type { HydratedDocument } from 'mongoose';
import { notFound } from '../../lib/ownership.ts';
import { BookModel, type BookFields } from '../books/book.model.ts';
import { PhotoModel, type PhotoFields } from '../photos/photo.model.ts';

export function toOrganizable(photo: HydratedDocument<PhotoFields>): OrganizablePhoto {
  return {
    id: photo.id,
    status: photo.status,
    hidden: photo.hidden,
    capturedAt: photo.capturedAt ? photo.capturedAt.toISOString() : null,
    localDateTime: photo.localDateTime,
    gps: photo.gps ? { lat: photo.gps.lat, lng: photo.gps.lng } : null,
    gpsStatus: photo.gpsStatus,
    dayDate: photo.dayDate,
    assignedBy: photo.assignedBy,
    flags: [...photo.flags],
  };
}

export function diaryDates(book: Pick<BookFields, 'days'>): string[] {
  return book.days.filter((d) => d.diary.trim() !== '').map((d) => d.date);
}

/** The book's days (see daySet): where photos and diary entries may go. */
export async function allowedDays(book: HydratedDocument<BookFields>, userId: string) {
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

export interface Reorganized {
  book: HydratedDocument<BookFields>;
  summary: SortingSummary;
}

const MAX_ATTEMPTS = 3;

/**
 * Re-runs automatic organisation for a book after any change. Only automatic
 * data is written: a photo's day is updated only while it is still `auto`
 * (checked in the write itself, so a move the user makes mid-run is never
 * undone), and chapters are saved only if the book did not change meanwhile.
 */
export async function reorganize(bookId: string, userId: string): Promise<Reorganized> {
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const book = await BookModel.findOne({ _id: bookId, userId, state: 'active' });
    if (!book) throw notFound();
    const photos = await PhotoModel.find({ bookId: book._id, userId, status: 'ready' });
    const byId = new Map(photos.map((p) => [p.id, p]));

    const result = organize(photos.map(toOrganizable), {
      startDate: book.startDate,
      endDate: book.endDate,
      diaryDates: diaryDates(book),
      chapters: book.chapters.map((c) => ({ id: c.id, title: c.title, dayDates: [...c.dayDates] })),
      chaptersEdited: book.chaptersEdited,
    });

    const ops = result.photoChanges.map((change) => {
      const photo = byId.get(change.id) as HydratedDocument<PhotoFields>;
      return photo.assignedBy === 'auto'
        ? {
            updateOne: {
              filter: { _id: photo._id, assignedBy: 'auto' as const },
              update: { $set: { dayDate: change.dayDate, flags: change.flags } },
            },
          }
        : {
            updateOne: {
              filter: { _id: photo._id },
              update: { $set: { flags: change.flags } },
            },
          };
    });
    if (ops.length > 0) await PhotoModel.bulkWrite(ops);

    const saved = await BookModel.findOneAndUpdate(
      { _id: book._id, userId, state: 'active', updatedAt: book.updatedAt },
      { $set: { chapters: result.chapters, organizedAt: new Date() } },
      { returnDocument: 'after' },
    );
    if (saved) {
      const fresh = await PhotoModel.find({ bookId: book._id, userId, status: 'ready' });
      return { book: saved, summary: sortingSummary(fresh.map(toOrganizable)) };
    }
    // The book changed while we worked (e.g. chapters were edited): start over.
  }
  throw new Error('Organisation kept conflicting with concurrent edits');
}
