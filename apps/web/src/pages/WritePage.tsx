import {
  chapterTitle,
  daySet,
  MAX_CAPTION_LENGTH,
  MAX_DIARY_LENGTH,
  mergeWithPrevious,
  orderDayPhotos,
  renameChapter,
  resolveChapters,
  resolveTheme,
  sortingSummary,
  splitChapter,
  type Book,
  type Chapter,
  type Photo,
  type PhotoLayout,
  type ThemeDefinition,
} from '@tb/shared';
import { useMutation } from '@tanstack/react-query';
import { Link, useParams } from 'react-router';
import { AutosaveField } from '../components/AutosaveField.tsx';
import { ApiRequestError } from '../lib/api.ts';
import { useBook, useSetDayLayout } from '../lib/books.ts';
import { formatDayHeading } from '../lib/dates.ts';
import { useJournal } from '../lib/journal.ts';
import { photoImageUrl, usePhotos } from '../lib/photos.ts';
import { NotFoundPage } from './NotFoundPage.tsx';
import { Loading, LoadError } from '../components/LoadState.tsx';

const LAYOUT_LABELS: Record<PhotoLayout, string> = {
  'hero-1': 'One photo a page',
  'split-2': 'Two photos a page',
  'mosaic-3': 'Three photos a page',
  'grid-4': 'Four photos a page',
};

const MAX_CHAPTER_TITLE = 120;

/**
 * The book's words and shape, chapter by chapter and day by day: chapter
 * titles, where chapters begin, a diary entry for each day, and each photo's
 * caption and place in its day.
 */
export function WritePage() {
  const { bookId = '' } = useParams();
  const book = useBook(bookId);
  const photos = usePhotos(bookId);
  const journal = useJournal(bookId);
  const setLayout = useSetDayLayout(bookId);
  const reshape = useMutation({
    mutationFn: (change: (chapters: Chapter[]) => Chapter[]) => journal.saveChapters(change),
  });
  const reorder = useMutation({
    mutationFn: ({ date, ids }: { date: string; ids: string[] }) =>
      journal.savePhotoOrder(date, ids),
  });

  if (book.isPending || photos.isPending) return <Loading />;
  if (book.isError) {
    if (book.error instanceof ApiRequestError && book.error.status === 404) return <NotFoundPage />;
    return <LoadError what="this book" onRetry={() => void book.refetch()} />;
  }
  if (photos.isError) {
    return <LoadError what="the photos" onRetry={() => void photos.refetch()} />;
  }

  const b = book.data;
  const ready = photos.data.filter((p) => p.status === 'ready');
  const days = daySet(
    {
      startDate: b.startDate,
      endDate: b.endDate,
      diaryDates: b.days.map((d) => d.date),
      chapters: b.chapters,
    },
    ready,
  );
  // Before the first organisation there are no chapters: just the days.
  const chapters: (Chapter | null)[] =
    b.chapters.length > 0 ? resolveChapters(b.chapters, days) : [null];
  const unsorted = sortingSummary(ready).toSort;
  const busy = reshape.isPending;

  const day = (date: string, splittable: boolean) => (
    <DayCard
      key={date}
      book={b}
      date={date}
      photos={ready.filter((p) => !p.hidden && p.dayDate === date)}
      theme={resolveTheme(b.theme).definition}
      journal={journal}
      layoutBusy={setLayout.isPending}
      onLayout={(layout) => setLayout.mutate({ date, layout })}
      orderBusy={reorder.isPending}
      onReorder={(ids) => reorder.mutate({ date, ids })}
      onSplit={splittable ? () => reshape.mutate((cs) => splitChapter(cs, date)) : undefined}
      busy={busy}
    />
  );

  return (
    <section className="stack write-page" style={{ gap: '1.5rem' }}>
      <Link to={`/books/${b.id}`} className="muted">
        ← {b.title}
      </Link>

      <header className="stack" style={{ gap: '0.4rem' }}>
        <p className="eyebrow">Journal</p>
        <h1>Write your story</h1>
        <p className="muted">
          Name your chapters, write a few lines for each day and a caption for each photo.
          Everything saves as you type.
        </p>
      </header>

      {unsorted > 0 && (
        <p className="card write-note">
          {unsorted === 1 ? '1 photo has' : `${unsorted} photos have`} no day yet, so{' '}
          {unsorted === 1 ? 'it is' : 'they are'} not shown here.{' '}
          <Link to={`/books/${b.id}/sort`}>Sort photos</Link>
        </p>
      )}

      {(setLayout.isError || reshape.isError || reorder.isError) && (
        <p role="alert" className="form-error">
          Could not save that change. Try again.
        </p>
      )}

      <ol className="write-chapters">
        {chapters.map((chapter, i) =>
          chapter === null ? (
            <li key="days">
              <ol className="write-days">{days.map((d) => day(d, false))}</ol>
            </li>
          ) : (
            <li key={chapter.id} className="write-chapter">
              <ChapterHead
                // A new shape (split, merge) starts the field afresh; typing does not.
                key={chapter.dayDates.join()}
                chapter={chapter}
                index={i}
                busy={busy}
                onRename={(title) =>
                  journal.saveChapters((cs) => renameChapter(cs, chapter.id, title))
                }
                onMerge={
                  i > 0
                    ? () => reshape.mutate((cs) => mergeWithPrevious(cs, chapter.id))
                    : undefined
                }
              />
              <ol className="write-days">{chapter.dayDates.map((d, j) => day(d, j > 0))}</ol>
            </li>
          ),
        )}
      </ol>
    </section>
  );
}

function ChapterHead({
  chapter,
  index,
  busy,
  onRename,
  onMerge,
}: {
  chapter: Chapter;
  index: number;
  busy: boolean;
  onRename: (title: string) => Promise<unknown>;
  onMerge?: () => void;
}) {
  const automatic = chapterTitle(index, chapter.dayDates);
  return (
    <header className="write-chapter-head">
      <p className="eyebrow">Chapter {index + 1}</p>
      <AutosaveField
        label={`Title of chapter ${index + 1}`}
        initial={chapter.title === automatic ? '' : chapter.title}
        // An empty title goes back to the automatic one.
        onSave={(text) => onRename(text.trim() || automatic)}
        maxLength={MAX_CHAPTER_TITLE}
        placeholder={`Name this chapter, e.g. “Tokyo”  (${automatic})`}
        className="write-chapter-title"
      />
      {onMerge && (
        <button type="button" className="link-button" disabled={busy} onClick={onMerge}>
          Join with the chapter before
        </button>
      )}
    </header>
  );
}

function DayCard({
  book,
  date,
  photos,
  theme,
  journal,
  layoutBusy,
  onLayout,
  orderBusy,
  onReorder,
  onSplit,
  busy,
}: {
  book: Book;
  date: string;
  photos: Photo[];
  theme: ThemeDefinition;
  journal: ReturnType<typeof useJournal>;
  layoutBusy: boolean;
  onLayout: (layout: PhotoLayout | null) => void;
  orderBusy: boolean;
  onReorder: (ids: string[]) => void;
  onSplit?: () => void;
  busy: boolean;
}) {
  const heading = formatDayHeading(date, book.startDate);
  const arranged = book.overrides.photoOrder.find((o) => o.date === date)?.photoIds;
  const ordered = orderDayPhotos(photos, arranged);
  const chosenLayout = book.overrides.dayLayouts.find((d) => d.date === date)?.layout;

  const move = (from: number, to: number) => {
    const ids = ordered.map((p) => p.id);
    const [moved] = ids.splice(from, 1);
    ids.splice(to, 0, moved as string);
    onReorder(ids);
  };

  return (
    <li className="card write-day">
      {onSplit && (
        <button type="button" className="write-split link-button" disabled={busy} onClick={onSplit}>
          ✂ Start a new chapter here
        </button>
      )}
      <div className="write-day-head">
        <h2>{heading}</h2>
        {/* Pages after the day's opener; only worth choosing with photos to spread. */}
        {photos.length > 1 && (
          <label className="write-layout">
            <span className="visually-hidden">Photo layout for {heading}</span>
            <select
              value={
                chosenLayout && theme.photos.layouts.includes(chosenLayout) ? chosenLayout : ''
              }
              disabled={layoutBusy}
              onChange={(event) => onLayout((event.target.value || null) as PhotoLayout | null)}
            >
              <option value="">{LAYOUT_LABELS[theme.photos.defaultLayout]} (style default)</option>
              {theme.photos.layouts
                .filter((l) => l !== theme.photos.defaultLayout)
                .map((l) => (
                  <option key={l} value={l}>
                    {LAYOUT_LABELS[l]}
                  </option>
                ))}
            </select>
          </label>
        )}
      </div>
      <AutosaveField
        label={`Diary for ${heading}`}
        initial={book.days.find((d) => d.date === date)?.diary ?? ''}
        onSave={(text) => journal.saveDiary(date, text)}
        multiline
        maxLength={MAX_DIARY_LENGTH}
        placeholder="What happened today? Where did you go, what did you eat, who did you meet?"
        className="write-diary"
      />
      {ordered.length > 0 && (
        <ol className="write-photos">
          {ordered.map((p, k) => (
            <li key={p.id}>
              <div className="write-photo-frame">
                <img src={photoImageUrl(p.id, 'thumb')} alt="" loading="lazy" />
                {k === 0 && <span className="write-opener">Opens the day</span>}
              </div>
              <AutosaveField
                label={`Caption for ${p.originalFilename}`}
                initial={p.caption}
                onSave={(text) => journal.saveCaption(p.id, text)}
                maxLength={MAX_CAPTION_LENGTH}
                placeholder="Add a caption"
              />
              {ordered.length > 1 && (
                <div className="write-order">
                  <button
                    type="button"
                    className="button small ghost"
                    disabled={orderBusy || k === 0}
                    aria-label={`Move ${p.originalFilename} earlier`}
                    onClick={() => move(k, k - 1)}
                  >
                    ←
                  </button>
                  <button
                    type="button"
                    className="button small ghost"
                    disabled={orderBusy || k === ordered.length - 1}
                    aria-label={`Move ${p.originalFilename} later`}
                    onClick={() => move(k, k + 1)}
                  >
                    →
                  </button>
                </div>
              )}
            </li>
          ))}
        </ol>
      )}
    </li>
  );
}
