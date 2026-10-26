import type { Book, ThemeId } from '@tb/shared';
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
    createdAt: book.createdAt.toISOString(),
    updatedAt: book.updatedAt.toISOString(),
  };
}
