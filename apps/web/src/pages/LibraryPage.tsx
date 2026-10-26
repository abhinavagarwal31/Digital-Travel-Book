import { Link } from 'react-router';
import { useBooks } from '../lib/books.ts';
import { formatDateRange, formatTripLength } from '../lib/dates.ts';

export function LibraryPage() {
  const books = useBooks();

  return (
    <section className="stack">
      <div className="page-title">
        <h1>My travel books</h1>
        <Link to="/books/new" className="button">
          New book
        </Link>
      </div>

      {books.isPending && <p className="muted">Loading your books…</p>}
      {books.isError && <p role="alert">Could not load your books. Try reloading the page.</p>}

      {books.data?.length === 0 && (
        <div className="card empty">
          <p>No books yet.</p>
          <p className="muted">Create a book for a trip, then add its photos.</p>
        </div>
      )}

      {books.data && books.data.length > 0 && (
        <ul className="book-grid" aria-label="Books">
          {books.data.map((book) => (
            <li key={book.id}>
              <Link to={`/books/${book.id}`} className="card book-card">
                <h2>{book.title}</h2>
                <p>
                  {formatDateRange(book.startDate, book.endDate)}
                  <span className="muted"> · {formatTripLength(book.startDate, book.endDate)}</span>
                </p>
                {book.destinations.length > 0 && (
                  <p className="muted">{book.destinations.join(' · ')}</p>
                )}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
