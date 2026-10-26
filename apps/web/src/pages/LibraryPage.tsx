import { Link } from 'react-router';
import { BookCover } from '../components/BookCover.tsx';
import { useBooks } from '../lib/books.ts';

export function LibraryPage() {
  const books = useBooks();

  return (
    <section className="stack" style={{ gap: '2rem' }}>
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

      {books.isPending && <p className="muted">Loading your books…</p>}
      {books.isError && <p role="alert">Could not load your books. Try reloading the page.</p>}

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
