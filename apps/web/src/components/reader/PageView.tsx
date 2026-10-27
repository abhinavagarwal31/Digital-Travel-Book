import type { Book, BookPage, ThemeDefinition } from '@tb/shared';
import type { CSSProperties } from 'react';
import { formatDateRange, formatTripLength } from '../../lib/dates.ts';
import { photoImageUrl } from '../../lib/photos.ts';
import { coverColour } from '../BookCover.tsx';
import { ComicBackCover, ComicCover, comicColour } from '../ComicCover.tsx';
import { RouteMapView } from './RouteMapView.tsx';

const longDate = new Intl.DateTimeFormat('en-GB', {
  weekday: 'long',
  day: 'numeric',
  month: 'long',
  timeZone: 'UTC',
});

/** A photo at its own shape: its frame (mount, polaroid, panel) wraps the whole picture. */
function Photo({ id, aspect, className }: { id: string; aspect: number; className?: string }) {
  return (
    <img
      className={className}
      src={photoImageUrl(id, 'page')}
      alt=""
      loading="lazy"
      draggable={false}
      style={{ aspectRatio: aspect }}
    />
  );
}

/** A photo with its caption beneath, when it has one. */
function CaptionedPhoto({
  id,
  aspect,
  caption,
}: {
  id: string;
  aspect: number;
  caption: string | undefined;
}) {
  return (
    <figure className="page-photo">
      <Photo id={id} aspect={aspect} />
      {caption && <figcaption>{caption}</figcaption>}
    </figure>
  );
}

const dayEyebrow = (dayNumber: number) => (dayNumber >= 1 ? `Day ${dayNumber}` : 'Before the trip');

interface PageViewProps {
  page: BookPage;
  index: number;
  book: Book;
  theme: ThemeDefinition;
  ownerName: string;
}

/** One page of the book. Every word on it comes from the user's own data. */
export function PageView({ page, index, book, theme, ownerName }: PageViewProps) {
  const coverInk = theme.colors.cover ?? coverColour(book.id);
  const cover = { '--cover': coverInk } as CSSProperties;
  const number = <span className="page-number">{index}</span>;

  switch (page.kind) {
    case 'cover':
      return (
        <div className="page cover-page" style={cover}>
          <ComicCover
            title={book.title}
            dates={formatDateRange(book.startDate, book.endDate)}
            places={book.destinations}
            colour={comicColour(book.id)}
            photoUrl={page.photoId ? photoImageUrl(page.photoId, 'page') : null}
          />
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

    case 'trip-map':
      return (
        <div className="page trip-map-page">
          <p className="page-eyebrow">The journey</p>
          <RouteMapView
            map={page.map}
            tiles={theme.map.tiles}
            width={600}
            height={560}
            label={`Map of the trip: ${page.map.pins.length} chapters, in reading order`}
            caption="Chapters, in reading order"
          />
          <ol className="trip-map-legend">
            {page.chapters.map((c) => (
              <li key={c.number} value={c.number}>
                <span>{c.title}</span>
                <small>{formatDateRange(c.firstDay, c.lastDay)}</small>
              </li>
            ))}
          </ol>
          {number}
        </div>
      );

    case 'chapter': {
      // Suggested titles already start "Chapter 2 · …"; don't say it twice.
      const named = !/^chapter\b/i.test(page.title);
      const places = page.map?.pins.length ?? 0;
      return (
        <div className={`page chapter-page${page.map ? '' : ' no-map'}`}>
          {page.map && (
            <RouteMapView
              map={page.map}
              tiles={theme.map.tiles}
              width={600}
              height={560}
              label={
                places === 1
                  ? 'Map of the one place photographed in this chapter'
                  : `Map of ${places} places photographed in this chapter, in order`
              }
              caption={
                places === 1 ? 'Where the photos were taken' : 'Places photographed, in order'
              }
            />
          )}
          <div className="chapter-heading">
            {named && <p className="page-eyebrow">Chapter {page.number}</p>}
            <h2>{page.title}</h2>
            <p className="chapter-meta">
              {/* A suggested title is already the date range. */}
              {named && `${formatDateRange(page.firstDay, page.lastDay)} · `}
              {page.dayCount} {page.dayCount === 1 ? 'day' : 'days'} · {page.photoCount}{' '}
              {page.photoCount === 1 ? 'photo' : 'photos'}
            </p>
          </div>
          {number}
        </div>
      );
    }

    case 'day':
      return (
        <div className="page day-page">
          <p className="page-eyebrow">{dayEyebrow(page.dayNumber)}</p>
          <h2>{longDate.format(new Date(`${page.dayDate}T00:00:00Z`))}</h2>
          <div className="day-hero-frame">
            <Photo id={page.heroPhotoId} aspect={page.heroAspect} className="day-hero" />
          </div>
          {page.heroCaption && <p className="day-caption">{page.heroCaption}</p>}
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

    case 'diary':
      return (
        <div className={`page diary-page${page.continued ? ' continued' : ''}`}>
          {page.opensDay ? (
            <>
              <p className="page-eyebrow">{dayEyebrow(page.dayNumber)}</p>
              <h2>{longDate.format(new Date(`${page.dayDate}T00:00:00Z`))}</h2>
            </>
          ) : (
            <p className="page-eyebrow diary-eyebrow">
              {dayEyebrow(page.dayNumber)} · {page.continued ? 'Diary, continued' : 'Diary'}
            </p>
          )}
          <div className="diary-text">
            {page.paragraphs.map((text, i) => (
              <p key={i}>{text}</p>
            ))}
          </div>
          {number}
        </div>
      );

    case 'photos':
      return (
        <div className={`page photos-page count-${page.photoIds.length}`}>
          <div className="photo-layout" data-arrangement={page.arrangement}>
            {page.photoIds.map((id, i) => (
              <CaptionedPhoto
                key={id}
                id={id}
                aspect={page.aspects[i] ?? 4 / 3}
                caption={page.captions[id]}
              />
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
        <div className="page cover-page back-cover" style={cover}>
          <ComicBackCover colour={comicColour(book.id)} />
        </div>
      );
  }
}
