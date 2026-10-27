import { coverDesignOf, resolveTheme, type Book, type CoverDesign } from '@tb/shared';
import type { CSSProperties } from 'react';
import { formatDateRange } from '../lib/dates.ts';
import { photoImageUrl } from '../lib/photos.ts';
import { ComicBackCover, ComicCover, comicColour } from './ComicCover.tsx';
import { TravelBackCover, TravelCover } from './TravelCover.tsx';

// Cloth-bound colours; each book keeps the same one because it is picked from its id.
const COVER_COLOURS = ['#8a3b20', '#1f4e5a', '#4b5d2a', '#2c3e66', '#6b2d4a', '#8a6a1f'];

export function coverColour(bookId: string): string {
  let hash = 0;
  for (const char of bookId) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return COVER_COLOURS[hash % COVER_COLOURS.length] as string;
}

interface CoverArtProps {
  design: CoverDesign;
  bookId: string;
  title: string;
  dates: string;
  places: string[];
  photoUrl?: string | null;
  animate?: 'always' | 'hover';
  headingLevel?: 1 | 2 | null;
}

/** The front cover in the design its theme calls for: a comic panel only for the comic theme. */
export function CoverArt({ design, bookId, ...cover }: CoverArtProps) {
  return design === 'comic' ? (
    <ComicCover {...cover} colour={comicColour(bookId)} />
  ) : (
    <TravelCover {...cover} design={design} />
  );
}

export function BackCoverArt({ design, bookId }: { design: CoverDesign; bookId: string }) {
  return design === 'comic' ? (
    <ComicBackCover colour={comicColour(bookId)} />
  ) : (
    <TravelBackCover design={design} />
  );
}

type CoverBook = Pick<Book, 'id' | 'title' | 'startDate' | 'endDate' | 'destinations' | 'theme'> & {
  overrides?: Pick<Book['overrides'], 'coverPhotoId'>;
};

/**
 * A book as it sits on a shelf, its cover made the way its theme says.
 * Purely visual; the parent supplies the link. On a shelf it moves only when
 * pointed at.
 */
export function BookCover({
  book,
  animate = 'hover',
}: {
  book: CoverBook;
  animate?: 'always' | 'hover';
}) {
  const theme = resolveTheme(book.theme).definition;
  const design = coverDesignOf(theme);
  const style = {
    '--cover': theme.colors.cover ?? coverColour(book.id),
    '--cover-ink': theme.colors.coverInk,
  } as CSSProperties;
  return (
    <div className={`cover ${design === 'comic' ? 'comic' : 'designed'}`} style={style}>
      <CoverArt
        design={design}
        bookId={book.id}
        title={book.title}
        dates={formatDateRange(book.startDate, book.endDate)}
        places={book.destinations}
        photoUrl={
          book.overrides?.coverPhotoId ? photoImageUrl(book.overrides.coverPhotoId, 'page') : null
        }
        animate={animate}
        headingLevel={2}
      />
    </div>
  );
}
