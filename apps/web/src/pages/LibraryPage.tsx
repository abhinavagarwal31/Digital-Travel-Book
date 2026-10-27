import { lazy, Suspense } from 'react';
import { Link } from 'react-router';
import { BookCover } from '../components/BookCover.tsx';
import { Loading, LoadError } from '../components/LoadState.tsx';
import { usePlaces } from '../lib/account.ts';
import { useBooks } from '../lib/books.ts';

// The map brings the world's outlines and d3 with it: loaded only when the library opens.
const WorldMap = lazy(() => import('../components/WorldMap.tsx'));

/** Where the trips have been, as the centrepiece of the library. */
function YourWorld() {
  const places = usePlaces();
  const trips = places.data ?? [];
  const count = trips.reduce((n, t) => n + t.points.length, 0);
  return (
    <section className="your-world" aria-labelledby="world-heading">
      <div className="your-world-text">
        <h2 id="world-heading">Your world</h2>
        <p className="muted">
          {count === 0
            ? 'Places from your photos will appear here as pins.'
            : `${count} ${count === 1 ? 'place' : 'places'} across ${trips.length} ${trips.length === 1 ? 'trip' : 'trips'}`}
        </p>
      </div>
      <Suspense fallback={<div className="world-map placeholder" aria-hidden="true" />}>
        <WorldMap trips={trips} />
      </Suspense>
    </section>
  );
}

export function LibraryPage() {
  const books = useBooks();

  return (
    <section className="stack" style={{ gap: '2rem' }}>
      <YourWorld />

      <div className="page-title">
        <div>
          <p className="eyebrow">Your library</p>
          <h1>My travel books</h1>
        </div>
        {books.data && books.data.length > 0 && (
          <Link to="/books/new" className="button">
            New book
          </Link>
        )}
      </div>

      {books.isPending && <Loading label="Loading your books…" />}
      {books.isError && <LoadError what="your books" onRetry={() => void books.refetch()} />}

      {books.data?.length === 0 && (
        <div className="card empty">
          <h2>No books yet.</h2>
          <p className="muted">Start with one trip: give it a name and dates, then add photos.</p>
          <Link to="/books/new" className="button large" style={{ marginTop: '0.75rem' }}>
            Create your first book
          </Link>
        </div>
      )}

      {books.data && books.data.length > 0 && (
        <ul className="shelf" aria-label="Books">
          {books.data.map((book) => (
            <li key={book.id}>
              <Link to={`/books/${book.id}`} className="cover-link" aria-label={book.title}>
                <BookCover book={book} />
              </Link>
            </li>
          ))}
          <li>
            <Link to="/books/new" className="cover-link" aria-label="New book">
              <div className="cover blank">
                <span className="plus" aria-hidden="true">
                  +
                </span>
                <span>New book</span>
              </div>
            </Link>
          </li>
        </ul>
      )}
    </section>
  );
}
