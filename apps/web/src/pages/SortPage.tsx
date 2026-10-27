import {
  computeStops,
  daySet,
  DEFAULT_ORGANIZE_CONFIG,
  sortingStatus,
  sortingSummary,
  type Photo,
  type SortingReason,
} from '@tb/shared';
import { useState, type MouseEvent } from 'react';
import { Link, useParams } from 'react-router';
import { ApiRequestError } from '../lib/api.ts';
import { useBook } from '../lib/books.ts';
import { formatDayHeading } from '../lib/dates.ts';
import { AFTER_ANY_TIME, photoImageUrl, usePhotos } from '../lib/photos.ts';
import { useSorting, type Undo } from '../lib/sorting.ts';
import { NotFoundPage } from './NotFoundPage.tsx';

export const REASON_LABELS: Record<SortingReason, string> = {
  no_date: 'No date',
  outside_trip: 'Date outside the trip',
  removed_by_you: 'You took it out of a day',
  no_date_but_location: 'No date (has location)',
  location_check: 'Location looks wrong',
};

const MAX_UNDO = 20;

const time = (p: Photo) => p.localDateTime?.slice(11, 16) ?? null;
const byTime = (a: Photo, b: Photo) =>
  (a.localDateTime ?? AFTER_ANY_TIME).localeCompare(b.localDateTime ?? AFTER_ANY_TIME);
const byFilename = (a: Photo, b: Photo) =>
  a.originalFilename.localeCompare(b.originalFilename, undefined, { numeric: true });
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

/** One photo on the board: a toggle button, so it works by click, tap and keyboard. */
function PhotoChip({
  photo,
  selected,
  onToggle,
  note,
}: {
  photo: Photo;
  selected: boolean;
  onToggle: (event: MouseEvent) => void;
  note?: string;
}) {
  return (
    <button
      type="button"
      className="sort-chip"
      aria-pressed={selected}
      aria-label={[photo.originalFilename, time(photo), note].filter(Boolean).join(', ')}
      onClick={onToggle}
    >
      <img src={photoImageUrl(photo.id, 'thumb')} alt="" loading="lazy" />
      {time(photo) && <span className="sort-chip-time">{time(photo)}</span>}
      {note && <span className="sort-chip-note">{note}</span>}
      <span className="sort-chip-check" aria-hidden="true" />
    </button>
  );
}

/** A day's photos grouped into the stops (one place, one visit) they were taken at. */
function stopGroups(dayPhotos: Photo[]): { key: string; label: string | null; photos: Photo[] }[] {
  const outliers = new Set(
    dayPhotos.filter((p) => p.flags.includes('gps_outlier')).map((p) => p.id),
  );
  const stops = computeStops(dayPhotos, outliers, DEFAULT_ORGANIZE_CONFIG);
  const byId = new Map(dayPhotos.map((p) => [p.id, p]));
  const grouped = new Set<string>();
  const groups = stops.map((stop) => {
    const photos = [...stop.locatedPhotoIds, ...stop.unlocatedPhotoIds]
      .map((id) => byId.get(id) as Photo)
      .sort(byTime);
    photos.forEach((p) => grouped.add(p.id));
    const [first, last] = [time(photos[0] as Photo), time(photos.at(-1) as Photo)];
    return { key: stop.id, label: first === last ? first : `${first} – ${last}`, photos };
  });
  const rest = dayPhotos.filter((p) => !grouped.has(p.id)).sort(byTime);
  if (rest.length > 0)
    groups.push({ key: 'rest', label: groups.length > 0 ? 'Other photos' : null, photos: rest });
  return groups.sort((a, b) => byTime(a.photos[0] as Photo, b.photos[0] as Photo));
}

export function SortPage() {
  const { bookId = '' } = useParams();
  const book = useBook(bookId);
  const photos = usePhotos(bookId);
  const sorting = useSorting(bookId);
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  const [anchor, setAnchor] = useState<string | null>(null);
  const [history, setHistory] = useState<{ label: string; undo: Undo }[]>([]);
  const [notice, setNotice] = useState<{ text: string; error?: boolean } | null>(null);
  const [busy, setBusy] = useState(false);
  const [target, setTarget] = useState('');

  if (book.isPending || photos.isPending) return <p className="muted">Loading…</p>;
  if (book.isError) {
    if (book.error instanceof ApiRequestError && book.error.status === 404) return <NotFoundPage />;
    return <p role="alert">Could not load this book. Try reloading the page.</p>;
  }
  if (photos.isError) return <p role="alert">Could not load the photos. Try reloading the page.</p>;

  const b = book.data;
  const ready = photos.data.filter((p) => p.status === 'ready');
  const summary = sortingSummary(ready);
  const statusOf = new Map(ready.map((p) => [p.id, sortingStatus(p)]));
  const tray = ready.filter((p) => statusOf.get(p.id)?.toSort).sort(byFilename);
  const toCheck = ready.filter((p) => statusOf.get(p.id)?.toCheck).sort(byTime);
  const excluded = ready.filter((p) => p.hidden).sort(byFilename);
  const days = daySet(
    {
      startDate: b.startDate,
      endDate: b.endDate,
      diaryDates: b.days.filter((d) => d.diary).map((d) => d.date),
      chapters: b.chapters,
    },
    ready,
  );
  const visible = ready.filter((p) => !p.hidden);
  const chosen = visible.filter((p) => selected.has(p.id));
  const moveTarget = days.includes(target) ? target : (days[0] ?? '');
  const heading = (day: string) => formatDayHeading(day, b.startDate);

  function toggle(photo: Photo, list: Photo[], event: MouseEvent) {
    const next = new Set(selected);
    const from = anchor ? list.findIndex((p) => p.id === anchor) : -1;
    if (event.shiftKey && from >= 0) {
      // Shift-click selects everything between the last photo clicked and this one.
      const to = list.findIndex((p) => p.id === photo.id);
      for (const p of list.slice(Math.min(from, to), Math.max(from, to) + 1)) next.add(p.id);
    } else if (next.has(photo.id)) {
      next.delete(photo.id);
    } else {
      next.add(photo.id);
    }
    setSelected(next);
    setAnchor(photo.id);
  }

  const chip = (photo: Photo, list: Photo[], note?: string) => (
    <PhotoChip
      key={photo.id}
      photo={photo}
      note={note}
      selected={selected.has(photo.id)}
      onToggle={(e) => toggle(photo, list, e)}
    />
  );

  async function run(label: string, action: () => Promise<Undo>) {
    setBusy(true);
    try {
      const undo = await action();
      setHistory((h) => [...h.slice(1 - MAX_UNDO), { label, undo }]);
      setSelected(new Set());
      setNotice({ text: label });
    } catch (err) {
      setNotice({ text: err instanceof Error ? err.message : 'Something went wrong', error: true });
    } finally {
      setBusy(false);
    }
  }

  async function undoLast() {
    const last = history.at(-1);
    if (!last) return;
    setBusy(true);
    try {
      await last.undo();
      setHistory((h) => h.slice(0, -1));
      setNotice({ text: `Undone: ${last.label}` });
    } catch (err) {
      const stale = err instanceof ApiRequestError && err.status === 409;
      setHistory((h) => h.slice(0, -1));
      setNotice({
        text: stale
          ? 'Could not undo: those photos were changed since. Nothing was overwritten.'
          : 'Could not undo. Try again.',
        error: true,
      });
    } finally {
      setBusy(false);
    }
  }

  const moveTo = (photos: Photo[], dayDate: string | null) =>
    run(
      dayDate
        ? `Moved ${plural(photos.length, 'photo')} to ${heading(dayDate)}`
        : `Left ${plural(photos.length, 'photo')} unsorted`,
      () => sorting.move.mutateAsync({ photos, dayDate }),
    );

  const left = summary.ready - summary.excluded;

  return (
    <section className="stack sort-page" style={{ gap: '1.5rem' }}>
      <Link to={`/books/${b.id}`} className="muted">
        ← {b.title}
      </Link>

      <header className="sort-header">
        <div className="stack" style={{ gap: '0.4rem' }}>
          <p className="eyebrow">Sorting board</p>
          <h1>Sort your photos</h1>
          <p className="muted">
            Pick photos, then choose where they go. Nothing is lost: you can always undo.
          </p>
        </div>
        <div className="sort-progress" aria-live="polite">
          <progress
            value={summary.inBook}
            max={Math.max(left, 1)}
            aria-label="Photos in the book"
          />
          <p>
            <strong>{summary.inBook}</strong> of {plural(left, 'photo')} in the book
            {summary.toSort > 0 && <> · {summary.toSort} to sort</>}
            {summary.toCheck > 0 && <> · {summary.toCheck} to check</>}
          </p>
        </div>
      </header>

      {ready.length === 0 ? (
        <div className="card empty">
          <h2>No photos yet</h2>
          <p className="muted">Add photos to this book first, then come back to sort them.</p>
          <Link to={`/books/${b.id}`} className="button">
            Add photos
          </Link>
        </div>
      ) : (
        summary.complete && (
          <div className="card sort-done" role="status">
            <div>
              <h2>Everything is sorted</h2>
              <p className="muted">
                Every photo has its day. You can still move things around at any time.
              </p>
            </div>
            <Link to={`/books/${b.id}/read`} className="button">
              Open book
            </Link>
          </div>
        )
      )}

      {ready.length > 0 && (
        <div className="sort-layout">
          <aside className="stack sort-tray" aria-labelledby="tray-heading">
            <section className="card stack">
              <header className="sort-section-head">
                <h2 id="tray-heading">To sort</h2>
                {tray.length > 1 && (
                  <button
                    type="button"
                    className="link-button"
                    onClick={() => setSelected(new Set([...selected, ...tray.map((p) => p.id)]))}
                  >
                    Select all
                  </button>
                )}
              </header>
              {tray.length === 0 ? (
                <p className="muted">Nothing left to sort.</p>
              ) : (
                <>
                  <p className="hint">
                    These have no day yet. Select them and choose a day, or leave them out.
                  </p>
                  <div className="sort-chips">
                    {tray.map((p) =>
                      chip(p, tray, REASON_LABELS[statusOf.get(p.id)?.reasons[0] ?? 'no_date']),
                    )}
                  </div>
                </>
              )}
            </section>

            {toCheck.length > 0 && (
              <section className="card stack" aria-labelledby="check-heading">
                <h2 id="check-heading">Check these</h2>
                <p className="hint">
                  These locations are far from the photos taken just before and after. Is the place
                  right?
                </p>
                <ul className="sort-checks">
                  {toCheck.map((p) => (
                    <li key={p.id}>
                      <img src={photoImageUrl(p.id, 'thumb')} alt="" loading="lazy" />
                      <div className="stack" style={{ gap: '0.35rem' }}>
                        <span className="sort-check-name">{p.originalFilename}</span>
                        <div className="actions">
                          <button
                            type="button"
                            className="button small"
                            disabled={busy}
                            onClick={() =>
                              run(`Kept the location of ${p.originalFilename}`, () =>
                                sorting.location.mutateAsync({ photo: p, action: 'confirm' }),
                              )
                            }
                          >
                            Location is right
                          </button>
                          <button
                            type="button"
                            className="button small ghost"
                            disabled={busy}
                            onClick={() =>
                              run(`Removed the location of ${p.originalFilename}`, () =>
                                sorting.location.mutateAsync({ photo: p, action: 'remove' }),
                              )
                            }
                          >
                            Remove location
                          </button>
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {excluded.length > 0 && (
              <details className="card sort-excluded">
                <summary>Left out of the book ({excluded.length})</summary>
                <ul className="sort-checks">
                  {excluded.map((p) => (
                    <li key={p.id}>
                      <img src={photoImageUrl(p.id, 'thumb')} alt="" loading="lazy" />
                      <div className="stack" style={{ gap: '0.35rem' }}>
                        <span className="sort-check-name">{p.originalFilename}</span>
                        <button
                          type="button"
                          className="button small ghost"
                          disabled={busy}
                          onClick={() =>
                            run(`Put ${p.originalFilename} back in the book`, () =>
                              sorting.setHidden.mutateAsync({ photos: [p], hidden: false }),
                            )
                          }
                        >
                          Include again
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
              </details>
            )}
          </aside>

          <div className="stack sort-days" aria-label="Days">
            {days.map((day) => {
              const dayPhotos = visible.filter((p) => p.dayDate === day);
              const ordered = [...dayPhotos].sort(byTime);
              return (
                <section key={day} className="card sort-day" aria-labelledby={`day-${day}`}>
                  <header className="sort-section-head">
                    <h3 id={`day-${day}`}>{heading(day)}</h3>
                    <span className="muted">{plural(dayPhotos.length, 'photo')}</span>
                    {chosen.length > 0 && (
                      <button
                        type="button"
                        className="button small"
                        disabled={busy}
                        aria-label={`Move selected photos to ${heading(day)}`}
                        onClick={() => moveTo(chosen, day)}
                      >
                        Move here
                      </button>
                    )}
                  </header>
                  {dayPhotos.length === 0 ? (
                    <p className="muted sort-day-empty">No photos on this day.</p>
                  ) : (
                    <div className="sort-stops">
                      {stopGroups(dayPhotos).map((group) => (
                        <div key={group.key} className="sort-stop">
                          {/* A lone photo already shows its time; the label would repeat it. */}
                          <span className="sort-stop-label">
                            {group.photos.length > 1 || group.key === 'rest' ? group.label : null}
                          </span>
                          <div className="sort-chips">
                            {group.photos.map((p) =>
                              chip(
                                p,
                                ordered,
                                statusOf.get(p.id)?.toCheck
                                  ? REASON_LABELS.location_check
                                  : undefined,
                              ),
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </section>
              );
            })}
          </div>
        </div>
      )}

      {(chosen.length > 0 || notice) && (
        <div className="sort-bar" role="region" aria-label="Sorting actions">
          {chosen.length > 0 ? (
            <div className="sort-bar-row" role="toolbar" aria-label="Selected photos">
              <strong>{chosen.length} selected</strong>
              <label className="sort-bar-move">
                <span>Move to</span>
                <select value={moveTarget} onChange={(e) => setTarget(e.target.value)}>
                  {days.map((day) => (
                    <option key={day} value={day}>
                      {heading(day)}
                    </option>
                  ))}
                </select>
              </label>
              <button
                type="button"
                className="button small"
                disabled={busy || !moveTarget}
                onClick={() => moveTo(chosen, moveTarget)}
              >
                Move
              </button>
              <button
                type="button"
                className="button small ghost"
                disabled={busy}
                onClick={() => moveTo(chosen, null)}
              >
                Leave unsorted
              </button>
              <button
                type="button"
                className="button small ghost"
                disabled={busy}
                onClick={() =>
                  run(`Left ${plural(chosen.length, 'photo')} out of the book`, () =>
                    sorting.setHidden.mutateAsync({ photos: chosen, hidden: true }),
                  )
                }
              >
                Exclude
              </button>
              {chosen.some((p) => p.assignedBy === 'user') && (
                <button
                  type="button"
                  className="button small ghost"
                  disabled={busy}
                  onClick={() =>
                    run(`Gave ${plural(chosen.length, 'photo')} back to automatic sorting`, () =>
                      sorting.reset.mutateAsync({ photos: chosen }),
                    )
                  }
                >
                  Reset to automatic
                </button>
              )}
              <button type="button" className="link-button" onClick={() => setSelected(new Set())}>
                Clear
              </button>
            </div>
          ) : (
            notice && (
              <div className={`sort-bar-row${notice.error ? ' error' : ''}`} role="status">
                <span>{notice.text}</span>
                {!notice.error && history.length > 0 && (
                  <button type="button" className="button small" disabled={busy} onClick={undoLast}>
                    Undo
                  </button>
                )}
                <button type="button" className="link-button" onClick={() => setNotice(null)}>
                  Dismiss
                </button>
              </div>
            )
          )}
        </div>
      )}
    </section>
  );
}
