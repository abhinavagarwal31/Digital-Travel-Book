import {
  daySet,
  MAX_CAPTION_LENGTH,
  MAX_DIARY_LENGTH,
  sortingSummary,
  type Photo,
} from '@tb/shared';
import { Link, useParams } from 'react-router';
import { AutosaveField } from '../components/AutosaveField.tsx';
import { ApiRequestError } from '../lib/api.ts';
import { useBook } from '../lib/books.ts';
import { formatDayHeading } from '../lib/dates.ts';
import { useJournal } from '../lib/journal.ts';
import { AFTER_ANY_TIME, photoImageUrl, usePhotos } from '../lib/photos.ts';
import { NotFoundPage } from './NotFoundPage.tsx';

const byTime = (a: Photo, b: Photo) =>
  (a.localDateTime ?? AFTER_ANY_TIME).localeCompare(b.localDateTime ?? AFTER_ANY_TIME);

/** The book's words, day by day: a diary entry for each day and a caption for each photo. */
export function WritePage() {
  const { bookId = '' } = useParams();
  const book = useBook(bookId);
  const photos = usePhotos(bookId);
  const journal = useJournal(bookId);

  if (book.isPending || photos.isPending) return <p className="muted">Loading…</p>;
  if (book.isError) {
    if (book.error instanceof ApiRequestError && book.error.status === 404) return <NotFoundPage />;
    return <p role="alert">Could not load this book. Try reloading the page.</p>;
  }
  if (photos.isError) return <p role="alert">Could not load the photos. Try reloading the page.</p>;

  const b = book.data;
  const ready = photos.data.filter((p) => p.status === 'ready');
  const inBook = ready.filter((p) => !p.hidden);
  const diaryOf = new Map(b.days.map((d) => [d.date, d.diary]));
  const days = daySet(
    {
      startDate: b.startDate,
      endDate: b.endDate,
      diaryDates: b.days.map((d) => d.date),
      chapters: b.chapters,
    },
    ready,
  );
  const unsorted = sortingSummary(ready).toSort;

  return (
    <section className="stack write-page" style={{ gap: '1.5rem' }}>
      <Link to={`/books/${b.id}`} className="muted">
        ← {b.title}
      </Link>

      <header className="stack" style={{ gap: '0.4rem' }}>
        <p className="eyebrow">Journal</p>
        <h1>Write your story</h1>
        <p className="muted">
          A few lines for each day, a caption for each photo. Everything saves as you type.
        </p>
      </header>

      {unsorted > 0 && (
        <p className="card write-note">
          {unsorted === 1 ? '1 photo has' : `${unsorted} photos have`} no day yet, so{' '}
          {unsorted === 1 ? 'it is' : 'they are'} not shown here.{' '}
          <Link to={`/books/${b.id}/sort`}>Sort photos</Link>
        </p>
      )}

      <ol className="write-days">
        {days.map((day) => {
          const dayPhotos = inBook.filter((p) => p.dayDate === day).sort(byTime);
          const heading = formatDayHeading(day, b.startDate);
          return (
            <li key={day} className="card write-day">
              <h2>{heading}</h2>
              <AutosaveField
                label={`Diary for ${heading}`}
                initial={diaryOf.get(day) ?? ''}
                onSave={(text) => journal.saveDiary(day, text)}
                multiline
                maxLength={MAX_DIARY_LENGTH}
                placeholder="What happened today? Where did you go, what did you eat, who did you meet?"
                className="write-diary"
              />
              {dayPhotos.length > 0 && (
                <ul className="write-photos">
                  {dayPhotos.map((p) => (
                    <li key={p.id}>
                      <img src={photoImageUrl(p.id, 'thumb')} alt="" loading="lazy" />
                      <AutosaveField
                        label={`Caption for ${p.originalFilename}`}
                        initial={p.caption}
                        onSave={(text) => journal.saveCaption(p.id, text)}
                        maxLength={MAX_CAPTION_LENGTH}
                        placeholder="Add a caption"
                      />
                    </li>
                  ))}
                </ul>
              )}
            </li>
          );
        })}
      </ol>
    </section>
  );
}
