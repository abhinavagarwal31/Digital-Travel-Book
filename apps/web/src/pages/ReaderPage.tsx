import { composeBook, resolveTheme, type BookPage } from '@tb/shared';
import { useEffect, useMemo } from 'react';
import { Link, useParams } from 'react-router';
import { FlipBook } from '../components/reader/FlipBook.tsx';
import { PageView } from '../components/reader/PageView.tsx';
import { useFlipBook } from '../components/reader/useFlipBook.ts';
import { useCurrentUser } from '../lib/auth.ts';
import { useBook } from '../lib/books.ts';
import { formatDayHeading } from '../lib/dates.ts';
import { visiblePages } from '../lib/flip.ts';
import { usePhotos } from '../lib/photos.ts';
import { themeStyle } from '../lib/theme.ts';
import '../reader.css';

function contents(pages: BookPage[], startDate: string) {
  return pages.flatMap((page, index) => {
    if (page.kind === 'cover') return [{ label: 'Cover', index }];
    if (page.kind === 'title') return [{ label: 'Title page', index }];
    if (page.kind === 'trip-map') return [{ label: 'Map of the trip', index }];
    if (page.kind === 'chapter') {
      const named = !/^chapter\b/i.test(page.title);
      return [{ label: named ? `${page.number}. ${page.title}` : page.title, index }];
    }
    if (page.kind === 'day' || (page.kind === 'diary' && page.opensDay)) {
      return [{ label: `\u2003${formatDayHeading(page.dayDate, startDate)}`, index }];
    }
    if (page.kind === 'closing') return [{ label: 'The end', index }];
    return [];
  });
}

export function ReaderPage() {
  const { bookId = '' } = useParams();
  const book = useBook(bookId);
  const photos = usePhotos(bookId);
  const me = useCurrentUser();

  const theme = useMemo(() => (book.data ? resolveTheme(book.data.theme) : null), [book.data]);
  const pages = useMemo(
    () =>
      book.data && photos.data && theme
        ? composeBook(book.data, photos.data, theme.definition)
        : [],
    [book.data, photos.data, theme],
  );
  const flip = useFlipBook(pages.length);
  const { next, prev } = flip;

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.target instanceof HTMLSelectElement || event.target instanceof HTMLInputElement) {
        return;
      }
      if (event.key === 'ArrowRight' || event.key === 'PageDown') next();
      if (event.key === 'ArrowLeft' || event.key === 'PageUp') prev();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [next, prev]);

  if (book.isError || photos.isError) {
    return (
      <div className="reader reader-message">
        <p role="alert">Could not open this book.</p>
        <Link to="/">Back to my books</Link>
      </div>
    );
  }
  if (!book.data || !photos.data || !theme) {
    return <div className="reader reader-message">Opening the book…</div>;
  }

  const b = book.data;
  const toc = contents(pages, b.startDate);
  const visible = visiblePages(flip.turned, pages.length, flip.mode);
  const current = [...toc].reverse().find((entry) => entry.index <= (visible.at(-1) ?? 0));
  const lastPage = pages.length - 2; // the back cover is not a numbered page
  const numbered = visible.filter((p) => p > 0 && p <= lastPage);
  const position =
    numbered.length === 0
      ? visible.includes(0)
        ? 'Cover'
        : 'Back cover'
      : `${numbered.length === 2 ? `Pages ${numbered[0]}–${numbered[1]}` : `Page ${numbered[0]}`} of ${lastPage}`;

  return (
    <div className="reader">
      <header className="reader-bar">
        <Link to={`/books/${b.id}`} className="reader-back">
          ← {b.title}
        </Link>
        <label className="reader-toc">
          <span className="visually-hidden">Go to</span>
          <select
            value={current?.index ?? 0}
            onChange={(event) => flip.goToPage(Number(event.target.value))}
          >
            {toc.map((entry) => (
              <option key={entry.index} value={entry.index}>
                {entry.label}
              </option>
            ))}
          </select>
        </label>
      </header>

      {/* The theme styles the book only; the controls around it stay the app's. */}
      <main
        className="reader-stage"
        style={themeStyle(theme.definition)}
        data-frame={theme.definition.photos.frame}
      >
        <FlipBook
          pageCount={pages.length}
          mode={flip.mode}
          total={flip.total}
          turned={flip.turned}
          flights={flip.flights}
          riffleOrigin={flip.riffleOrigin}
          onNext={flip.next}
          onPrev={flip.prev}
          label={b.title}
          renderPage={(index) => {
            const page = pages[index];
            return page ? (
              <PageView
                page={page}
                index={index}
                book={b}
                theme={theme.definition}
                ownerName={me.data?.name ?? ''}
              />
            ) : null;
          }}
        />
      </main>

      <footer className="reader-controls">
        <button
          type="button"
          className="turn-button"
          onClick={flip.prev}
          disabled={flip.turned === 0}
          aria-label="Previous page"
        >
          ‹
        </button>
        <p aria-live="polite">
          <strong>{current?.label}</strong>
          {position !== current?.label && <span className="reader-position"> · {position}</span>}
        </p>
        <button
          type="button"
          className="turn-button"
          onClick={flip.next}
          disabled={flip.turned === flip.total}
          aria-label="Next page"
        >
          ›
        </button>
      </footer>
    </div>
  );
}
