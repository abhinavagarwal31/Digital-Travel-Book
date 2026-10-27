import type { Book, Chapter, ThemeId } from '@tb/shared';
import { THEME_IDS } from '@tb/shared';
import mongoose, { type HydratedDocument, type Types } from 'mongoose';

export interface BookFields {
  userId: Types.ObjectId;
  schemaVersion: 1;
  title: string;
  description: string;
  startDate: string; // YYYY-MM-DD
  endDate: string; // YYYY-MM-DD
  defaultTz: string; // IANA
  destinations: string[];
  theme: { kind: 'preset'; id: ThemeId; version: number };
  /** Diary entries only. The book's full set of days is derived, never stored. */
  days: { date: string; diary: string }[];
  /** Chapters in reading order; a day belongs to at most one. */
  chapters: Chapter[];
  /** Set once the user changes chapters: from then on they are never re-suggested. */
  chaptersEdited: boolean;
  organizedAt: Date | null;
  // "deleting" hides the book while its photos and images are being removed.
  state: 'active' | 'deleting';
  createdAt: Date;
  updatedAt: Date;
}

const bookSchema = new mongoose.Schema<BookFields>(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    schemaVersion: { type: Number, enum: [1], default: 1 },
    title: { type: String, required: true },
    description: { type: String, default: '' },
    startDate: { type: String, required: true },
    endDate: { type: String, required: true },
    defaultTz: { type: String, required: true },
    destinations: { type: [String], default: [] },
    theme: {
      _id: false,
      kind: { type: String, enum: ['preset'], default: 'preset' },
      id: { type: String, enum: THEME_IDS, default: 'editorial' },
      version: { type: Number, default: 1 },
    },
    days: {
      type: [new mongoose.Schema({ date: String, diary: String }, { _id: false })],
      default: [],
    },
    chapters: {
      type: [
        new mongoose.Schema({ id: String, title: String, dayDates: [String] }, { _id: false }),
      ],
      default: [],
    },
    chaptersEdited: { type: Boolean, default: false },
    organizedAt: { type: Date, default: null },
    state: { type: String, enum: ['active', 'deleting'], default: 'active' },
  },
  { timestamps: true },
);

// The library page lists a user's books, most recently edited first.
bookSchema.index({ userId: 1, state: 1, updatedAt: -1 });

export const BookModel = mongoose.model<BookFields>('Book', bookSchema);

export function toBookDTO(book: HydratedDocument<BookFields>): Book {
  return {
    id: book._id.toString(),
    title: book.title,
    description: book.description,
    startDate: book.startDate,
    endDate: book.endDate,
    defaultTz: book.defaultTz,
    destinations: [...book.destinations],
    theme: { kind: book.theme.kind, id: book.theme.id, version: book.theme.version },
    days: book.days.map((d) => ({ date: d.date, diary: d.diary })),
    chapters: book.chapters.map((c) => ({ id: c.id, title: c.title, dayDates: [...c.dayDates] })),
    chaptersEdited: book.chaptersEdited,
    createdAt: book.createdAt.toISOString(),
    updatedAt: book.updatedAt.toISOString(),
  };
}
