import type { Book } from '@tb/shared';
import type { CSSProperties } from 'react';
import { formatDateRange } from '../lib/dates.ts';
import { photoImageUrl } from '../lib/photos.ts';
import { ComicCover, comicColour } from './ComicCover.tsx';

// Cloth-bound colours; each book keeps the same one because it is picked from its id.
const COVER_COLOURS = ['#8a3b20', '#1f4e5a', '#4b5d2a', '#2c3e66', '#6b2d4a', '#8a6a1f'];

export function coverColour(bookId: string): string {
  let hash = 0;
  for (const char of bookId) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return COVER_COLOURS[hash % COVER_COLOURS.length] as string;
}

type CoverBook = Pick<Book, 'id' | 'title' | 'startDate' | 'endDate' | 'destinations'> & {
  overrides?: Pick<Book['overrides'], 'coverPhotoId'>;
};

/**
 * A book as it sits on a shelf: its comic cover. Purely visual; the parent
 * supplies the link. On a shelf it moves only when pointed at.
 */
export function BookCover({
  book,
  animate = 'hover',
}: {
  book: CoverBook;
  animate?: 'always' | 'hover';
}) {
  const colour = coverColour(book.id);
  return (
    <div className="cover comic" style={{ '--cover': colour } as CSSProperties}>
      <ComicCover
        title={book.title}
        dates={formatDateRange(book.startDate, book.endDate)}
        places={book.destinations}
        colour={comicColour(book.id)}
        photoUrl={
          book.overrides?.coverPhotoId ? photoImageUrl(book.overrides.coverPhotoId, 'page') : null
        }
        animate={animate}
        headingLevel={2}
      />
    </div>
  );
}
