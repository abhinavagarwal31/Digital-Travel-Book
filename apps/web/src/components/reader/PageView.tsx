import type { Book, BookPage } from '@tb/shared';
import type { CSSProperties } from 'react';
import { formatDateRange, formatTripLength } from '../../lib/dates.ts';
import { photoImageUrl } from '../../lib/photos.ts';
import { coverColour } from '../BookCover.tsx';

const longDate = new Intl.DateTimeFormat('en-GB', {
  weekday: 'long',
  day: 'numeric',
  month: 'long',
  timeZone: 'UTC',
});

function Photo({ id, className }: { id: string; className?: string }) {
  return (
    <img
      className={className}
      src={photoImageUrl(id, 'page')}
      alt=""
      loading="lazy"
      draggable={false}
    />
  );
}

interface PageViewProps {
  page: BookPage;
  index: number;
  book: Book;
  ownerName: string;
}

/** One page of the book. Every word on it comes from the user's own data. */
export function PageView({ page, index, book, ownerName }: PageViewProps) {
  const number = <span className="page-number">{index}</span>;

  switch (page.kind) {
    case 'cover':
      return (
        <div
          className="page cover-page"
          style={{ '--cover': coverColour(book.id) } as CSSProperties}
        >
          <div className="cover-frame">
            <span className="cover-rule" />
            <h1>{book.title}</h1>
            <span className="cover-rule" />
            <p className="cover-dates">{formatDateRange(book.startDate, book.endDate)}</p>
            {book.destinations.length > 0 && (
              <p className="cover-places">{book.destinations.join(' · ')}</p>
            )}
          </div>
        </div>
      );

    case 'endpaper':
      return (
        <div className="page endpaper">
          <p>
            From the travels of
            <br />
            <strong>{ownerName}</strong>
          </p>
        </div>
      );

    case 'title':
      return (
        <div className="page title-page">
          <p className="page-eyebrow">A travel book</p>
          <h1>{book.title}</h1>
          <p className="title-dates">
            {formatDateRange(book.startDate, book.endDate)} ·{' '}
            {formatTripLength(book.startDate, book.endDate)}
          </p>
          {book.destinations.length > 0 && (
            <p className="title-places">{book.destinations.join(' · ')}</p>
          )}
          {book.description && <p className="title-description">{book.description}</p>}
          {number}
        </div>
      );

    case 'day':
      return (
        <div className="page day-page">
          <p className="page-eyebrow">
            {page.dayNumber >= 1 ? `Day ${page.dayNumber}` : 'Before the trip'}
          </p>
          <h2>{longDate.format(new Date(`${page.dayDate}T00:00:00Z`))}</h2>
          <Photo id={page.heroPhotoId} className="day-hero" />
          <p className="day-meta">
            {page.photoCount} {page.photoCount === 1 ? 'photo' : 'photos'}
            {page.timeRange &&
              (page.timeRange[0] === page.timeRange[1]
                ? ` · ${page.timeRange[0]}`
                : ` · ${page.timeRange[0]} – ${page.timeRange[1]}`)}
          </p>
          {number}
        </div>
      );

    case 'photos':
      return (
        <div className={`page photos-page count-${page.photoIds.length}`}>
          <div className="photo-layout">
            {page.photoIds.map((id) => (
              <Photo key={id} id={id} />
            ))}
          </div>
          {number}
        </div>
      );

    case 'closing':
      return (
        <div className="page closing-page">
          <span className="closing-mark" aria-hidden="true">
            ✦
          </span>
          <h2>{book.title}</h2>
          <p>{formatDateRange(book.startDate, book.endDate)}</p>
          <p className="closing-stats">
            {page.dayCount} {page.dayCount === 1 ? 'day' : 'days'} · {page.photoCount}{' '}
            {page.photoCount === 1 ? 'photo' : 'photos'}
          </p>
        </div>
      );

    case 'blank':
      return <div className="page blank" />;

    case 'back-cover':
      return (
        <div
          className="page cover-page back-cover"
          style={{ '--cover': coverColour(book.id) } as CSSProperties}
        >
          <span className="closing-mark" aria-hidden="true">
            ✦
          </span>
        </div>
      );
  }
}
