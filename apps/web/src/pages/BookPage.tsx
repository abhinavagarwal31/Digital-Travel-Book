import { sortingSummary } from '@tb/shared';
import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { BookCover } from '../components/BookCover.tsx';
import { BookForm, toFormValues } from '../components/BookForm.tsx';
import { PhotoGrid } from '../components/PhotoGrid.tsx';
import { PhotoUploader } from '../components/PhotoUploader.tsx';
import { ApiRequestError } from '../lib/api.ts';
import { useBook, useDeleteBook, useUpdateBook } from '../lib/books.ts';
import { formatDateRange, formatTripLength } from '../lib/dates.ts';
import { usePhotos } from '../lib/photos.ts';
import { NotFoundPage } from './NotFoundPage.tsx';

export function BookPage() {
  const { bookId = '' } = useParams();
  const book = useBook(bookId);
  const updateBook = useUpdateBook(bookId);
  const deleteBook = useDeleteBook(bookId);
  const photos = usePhotos(bookId);
  const navigate = useNavigate();
  const [editing, setEditing] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  if (book.isPending) return <p className="muted">Loading…</p>;
  if (book.isError) {
    if (book.error instanceof ApiRequestError && book.error.status === 404) return <NotFoundPage />;
    return <p role="alert">Could not load this book. Try reloading the page.</p>;
  }

  const b = book.data;
  const ready = photos.data?.filter((p) => p.status === 'ready') ?? [];
  const sorting = sortingSummary(ready);
  const toDecide = sorting.toSort + sorting.toCheck;

  if (editing) {
    return (
      <section className="card narrow">
        <h1>Edit trip details</h1>
        <BookForm
          initial={toFormValues(b)}
          submitLabel="Save changes"
          pendingLabel="Saving…"
          onSubmit={async (body) => {
            await updateBook.mutateAsync(body);
            setEditing(false);
          }}
          onCancel={() => setEditing(false)}
        />
      </section>
    );
  }

  return (
    <section className="stack" style={{ gap: '2rem' }}>
      <Link to="/" className="muted">
        ← All books
      </Link>

      <div className="book-hero">
        <BookCover book={b} />
        <div className="stack" style={{ gap: '0.9rem' }}>
          <p className="eyebrow">Travel book</p>
          <h1>{b.title}</h1>
          <p className="muted">
            {formatDateRange(b.startDate, b.endDate)} · {formatTripLength(b.startDate, b.endDate)}
          </p>
          <div className="actions">
            <Link to={`/books/${b.id}/read`} className="button large">
              Open book
            </Link>
            <Link to={`/books/${b.id}/write`} className="button ghost">
              Write captions &amp; diary
            </Link>
            <button type="button" className="button ghost" onClick={() => setEditing(true)}>
              Edit details
            </button>
          </div>
        </div>
      </div>

      <dl className="card details">
        <div>
          <dt>Destinations</dt>
          <dd>{b.destinations.length > 0 ? b.destinations.join(' · ') : '—'}</dd>
        </div>
        <div>
          <dt>Time zone</dt>
          <dd>{b.defaultTz}</dd>
        </div>
        {b.description && (
          <div style={{ gridColumn: '1 / -1' }}>
            <dt>About this trip</dt>
            <dd>{b.description}</dd>
          </div>
        )}
      </dl>

      <section className="stack" aria-labelledby="photos-heading">
        <div className="page-title">
          <h2 id="photos-heading">Photos</h2>
          {ready.length > 0 && (
            <div className="actions">
              <span className="muted">{ready.length} in this book</span>
              <Link
                to={`/books/${b.id}/sort`}
                className={`button${toDecide > 0 ? '' : ' ghost'}`}
                aria-label={toDecide > 0 ? `Sort photos, ${toDecide} need a decision` : undefined}
              >
                Sort photos
                {toDecide > 0 && (
                  <span className="count" aria-hidden="true">
                    {toDecide}
                  </span>
                )}
              </Link>
            </div>
          )}
        </div>
        <PhotoUploader bookId={b.id} />
        {photos.isError && <p role="alert">Could not load the photos. Try reloading the page.</p>}
        {photos.data && <PhotoGrid photos={photos.data} startDate={b.startDate} />}
      </section>

      <div className="danger-zone">
        {confirmingDelete ? (
          <div role="alertdialog" aria-label="Confirm delete" className="actions">
            <span>Delete “{b.title}” and everything in it? This cannot be undone.</span>
            <button
              type="button"
              className="button danger"
              disabled={deleteBook.isPending}
              onClick={() =>
                deleteBook.mutate(undefined, { onSuccess: () => navigate('/', { replace: true }) })
              }
            >
              {deleteBook.isPending ? 'Deleting…' : 'Delete book'}
            </button>
            <button
              type="button"
              className="button ghost"
              onClick={() => setConfirmingDelete(false)}
            >
              Keep it
            </button>
          </div>
        ) : (
          <button
            type="button"
            className="button ghost danger-text"
            onClick={() => setConfirmingDelete(true)}
          >
            Delete book…
          </button>
        )}
        {deleteBook.isError && (
          <p role="alert" className="form-error">
            Could not delete the book. Try again.
          </p>
        )}
      </div>
    </section>
  );
}
