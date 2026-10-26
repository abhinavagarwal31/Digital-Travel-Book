import { tripLengthDays } from '../schemas/book.ts';

/** The book's pages, derived from travel data on every render and never stored. */
export type BookPage =
  | { kind: 'cover' }
  | { kind: 'endpaper' }
  | { kind: 'title' }
  | {
      kind: 'day';
      dayDate: string;
      dayNumber: number;
      heroPhotoId: string;
      photoCount: number;
      /** First and last local times of the day's photos, when known ("08:05"). */
      timeRange: [string, string] | null;
    }
  | { kind: 'photos'; dayDate: string; photoIds: string[] }
  | { kind: 'closing'; dayCount: number; photoCount: number }
  | { kind: 'blank' }
  | { kind: 'back-cover' };

/** The photo fields composition needs; anything with these fits. */
export interface ComposablePhoto {
  id: string;
  status: string;
  hidden: boolean;
  dayDate: string | null;
  localDateTime: string | null;
}

export interface ComposableBook {
  startDate: string;
}

export const MAX_PHOTOS_PER_PAGE = 4;

/**
 * How many photos go on each page after a day's opener: groups of up to four,
 * never leaving a single photo alone after a full page (5 → 3 + 2).
 */
export function chunkSizes(count: number): number[] {
  const sizes: number[] = [];
  let left = count;
  while (left > 0) {
    const size = left <= MAX_PHOTOS_PER_PAGE ? left : left === 5 ? 3 : MAX_PHOTOS_PER_PAGE;
    sizes.push(size);
    left -= size;
  }
  return sizes;
}

// Sorts after any real "YYYY-MM-DDTHH:mm:ss", so untimed photos end their day.
const AFTER_ANY_TIME = '\uffff';
const clock = (localDateTime: string) => localDateTime.slice(11, 16);

/**
 * Deterministic page plan: cover, endpaper, title page, then for every day with
 * photos an opener (its first photo as hero) followed by photo pages in time
 * order, a closing page, and the back cover. Like a printed book it has an even
 * number of pages, so the back cover is always the back of the last leaf.
 * Photos without a day, hidden photos and photos still uploading are left out.
 * The same inputs always give the same pages.
 */
export function composeBook(book: ComposableBook, photos: ComposablePhoto[]): BookPage[] {
  const byDay = new Map<string, ComposablePhoto[]>();
  for (const photo of photos) {
    if (photo.status !== 'ready' || photo.hidden || !photo.dayDate) continue;
    const day = byDay.get(photo.dayDate) ?? [];
    day.push(photo);
    byDay.set(photo.dayDate, day);
  }

  const pages: BookPage[] = [{ kind: 'cover' }, { kind: 'endpaper' }, { kind: 'title' }];
  let photoCount = 0;

  for (const dayDate of [...byDay.keys()].sort()) {
    const dayPhotos = (byDay.get(dayDate) ?? []).sort(
      (a, b) =>
        (a.localDateTime ?? AFTER_ANY_TIME).localeCompare(b.localDateTime ?? AFTER_ANY_TIME) ||
        a.id.localeCompare(b.id),
    );
    const [hero, ...rest] = dayPhotos;
    if (!hero) continue;
    photoCount += dayPhotos.length;

    const times = dayPhotos.flatMap((p) => (p.localDateTime ? [clock(p.localDateTime)] : []));
    pages.push({
      kind: 'day',
      dayDate,
      dayNumber: tripLengthDays(book.startDate, dayDate),
      heroPhotoId: hero.id,
      photoCount: dayPhotos.length,
      timeRange: times.length > 0 ? [times[0] as string, times[times.length - 1] as string] : null,
    });

    let offset = 0;
    for (const size of chunkSizes(rest.length)) {
      pages.push({
        kind: 'photos',
        dayDate,
        photoIds: rest.slice(offset, offset + size).map((p) => p.id),
      });
      offset += size;
    }
  }

  pages.push({ kind: 'closing', dayCount: byDay.size, photoCount });
  if (pages.length % 2 === 0) pages.push({ kind: 'blank' });
  pages.push({ kind: 'back-cover' });
  return pages;
}
