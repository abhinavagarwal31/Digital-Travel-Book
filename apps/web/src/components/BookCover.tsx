import type { Book } from '@tb/shared';
import type { CSSProperties } from 'react';
import { formatDateRange } from '../lib/dates.ts';

// Cloth-bound colours; each book keeps the same one because it is picked from its id.
const COVER_COLOURS = ['#8a3b20', '#1f4e5a', '#4b5d2a', '#2c3e66', '#6b2d4a', '#8a6a1f'];

export function coverColour(bookId: string): string {
  let hash = 0;
  for (const char of bookId) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return COVER_COLOURS[hash % COVER_COLOURS.length] as string;
}

type CoverBook = Pick<Book, 'id' | 'title' | 'startDate' | 'endDate' | 'destinations'>;

/** A book drawn as a cloth-bound cover. Purely visual; the parent supplies the link. */
export function BookCover({ book }: { book: CoverBook }) {
  return (
    <div className="cover" style={{ '--cover': coverColour(book.id) } as CSSProperties}>
      <span className="ornament" aria-hidden="true" />
      <h2>{book.title}</h2>
      <p className="cover-meta">{formatDateRange(book.startDate, book.endDate)}</p>
      {book.destinations.length > 0 && (
        <p className="cover-places">{book.destinations.slice(0, 3).join(' · ')}</p>
      )}
    </div>
  );
}
