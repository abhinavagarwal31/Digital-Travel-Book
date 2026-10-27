import type { Book, Chapter, PhotoLayout, ThemeId } from '@tb/shared';
import { DEFAULT_THEME_ID, latestThemeVersion, PHOTO_LAYOUTS, THEME_IDS } from '@tb/shared';
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
  /** The owner's choices, keyed by photo id and date, never by page position. */
  overrides: {
    coverPhotoId: string | null;
    dayLayouts: { date: string; layout: PhotoLayout }[];
    photoOrder: { date: string; photoIds: string[] }[];
  };
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
      id: { type: String, enum: THEME_IDS, default: DEFAULT_THEME_ID },
      version: { type: Number, default: latestThemeVersion(DEFAULT_THEME_ID) },
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
    overrides: {
      _id: false,
      coverPhotoId: { type: String, default: null },
      dayLayouts: {
        type: [
          new mongoose.Schema(
            { date: String, layout: { type: String, enum: PHOTO_LAYOUTS } },
            { _id: false },
          ),
        ],
        default: [],
      },
      photoOrder: {
        type: [new mongoose.Schema({ date: String, photoIds: [String] }, { _id: false })],
        default: [],
      },
    },
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
    // Books saved before overrides existed have none.
    overrides: {
      coverPhotoId: book.overrides?.coverPhotoId ?? null,
      dayLayouts: (book.overrides?.dayLayouts ?? []).map((d) => ({
        date: d.date,
        layout: d.layout,
      })),
      photoOrder: (book.overrides?.photoOrder ?? []).map((o) => ({
        date: o.date,
        photoIds: [...o.photoIds],
      })),
    },
    createdAt: book.createdAt.toISOString(),
    updatedAt: book.updatedAt.toISOString(),
  };
}
