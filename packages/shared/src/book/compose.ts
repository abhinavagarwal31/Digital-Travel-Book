import { computeStops, type Stop } from '../organize/stops.ts';
import { contentDays, resolveChapters } from '../organize/structure.ts';
import { DEFAULT_ORGANIZE_CONFIG, type Chapter, type OrganizablePhoto } from '../organize/types.ts';
import { tripLengthDays } from '../schemas/book.ts';
import { chapterRouteMap, tripRouteMap, type RouteMap } from './maps.ts';

/** The book's pages, derived from travel data on every render and never stored. */
export type BookPage =
  | { kind: 'cover' }
  | { kind: 'endpaper' }
  | { kind: 'title' }
  | {
      kind: 'trip-map';
      map: RouteMap;
      chapters: { number: number; title: string; firstDay: string; lastDay: string }[];
    }
  | {
      kind: 'chapter';
      chapterId: string;
      number: number;
      title: string;
      firstDay: string;
      lastDay: string;
      dayCount: number;
      photoCount: number;
      /** Null when none of the chapter's photos has a usable location. */
      map: RouteMap | null;
    }
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

/** The photo fields composition needs (locations too, for the maps); the API's Photo fits. */
export type ComposablePhoto = OrganizablePhoto;

export interface ComposableBook {
  startDate: string;
  /** Diary entries; a day with one belongs to a chapter even without photos. */
  days: { date: string; diary: string }[];
  /** The stored chapters. With none, the days follow the title page directly. */
  chapters: Chapter[];
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

/** A day's photos in reading order: by local time, untimed last, ties by id. */
function inTimeOrder(photos: ComposablePhoto[]): ComposablePhoto[] {
  return [...photos].sort(
    (a, b) =>
      (a.localDateTime ?? AFTER_ANY_TIME).localeCompare(b.localDateTime ?? AFTER_ANY_TIME) ||
      a.id.localeCompare(b.id),
  );
}

function dayPages(book: ComposableBook, dayDate: string, photos: ComposablePhoto[]): BookPage[] {
  const [hero, ...rest] = inTimeOrder(photos);
  if (!hero) return [];
  const times = photos.flatMap((p) => (p.localDateTime ? [clock(p.localDateTime)] : [])).sort();
  const pages: BookPage[] = [
    {
      kind: 'day',
      dayDate,
      dayNumber: tripLengthDays(book.startDate, dayDate),
      heroPhotoId: hero.id,
      photoCount: photos.length,
      timeRange: times.length > 0 ? [times[0] as string, times.at(-1) as string] : null,
    },
  ];
  let offset = 0;
  for (const size of chunkSizes(rest.length)) {
    pages.push({
      kind: 'photos',
      dayDate,
      photoIds: rest.slice(offset, offset + size).map((p) => p.id),
    });
    offset += size;
  }
  return pages;
}

/**
 * Deterministic page plan: cover, endpaper, title page, a map of the whole
 * trip (when two or more chapters have places on it), then each chapter: an
 * opener with its own map, and for every day with photos an opener (its first
 * photo as hero) followed by photo pages in time order. Then a closing page
 * and the back cover. Like a printed book it has an even number of pages, so
 * the back cover is always the back of the last leaf.
 *
 * Photos without a day, hidden photos and photos still uploading are left
 * out; so are locations flagged as suspicious until the user confirms them.
 * The same inputs always give the same pages.
 */
export function composeBook(book: ComposableBook, photos: ComposablePhoto[]): BookPage[] {
  const inBook = photos.filter((p) => p.status === 'ready' && !p.hidden && p.dayDate);
  const byDay = new Map<string, ComposablePhoto[]>();
  for (const photo of inBook) {
    const day = byDay.get(photo.dayDate as string) ?? [];
    day.push(photo);
    byDay.set(photo.dayDate as string, day);
  }

  // Chapters as the reader sees them: every content day placed, and only
  // chapters with photos to show (diary pages come later).
  const diaryDates = book.days.filter((d) => d.diary !== '').map((d) => d.date);
  const resolved = resolveChapters(book.chapters, contentDays(photos, diaryDates));
  const sections: { chapter: Chapter | null; days: string[] }[] =
    resolved.length === 0
      ? [{ chapter: null, days: [...byDay.keys()].sort() }]
      : resolved.map((chapter) => ({
          chapter,
          days: chapter.dayDates.filter((d) => byDay.has(d)),
        }));
  const shown = sections.filter((s) => s.days.length > 0);

  // A stop belongs to the chapter holding the day of its first photo.
  const outliers = new Set(photos.filter((p) => p.flags.includes('gps_outlier')).map((p) => p.id));
  const dayOf = new Map(inBook.map((p) => [p.id, p.dayDate as string]));
  const stopsByDay = new Map<string, Stop[]>();
  for (const stop of computeStops(inBook, outliers, DEFAULT_ORGANIZE_CONFIG)) {
    const day = dayOf.get(stop.id);
    if (day) stopsByDay.set(day, [...(stopsByDay.get(day) ?? []), stop]);
  }

  const chapters = shown.flatMap((s, i) =>
    s.chapter
      ? [
          {
            chapter: s.chapter,
            days: s.days,
            number: i + 1,
            stops: s.days.flatMap((d) => stopsByDay.get(d) ?? []),
          },
        ]
      : [],
  );

  const pages: BookPage[] = [{ kind: 'cover' }, { kind: 'endpaper' }, { kind: 'title' }];
  const trip = tripRouteMap(
    chapters.map((c) => ({ id: c.chapter.id, number: c.number, stops: c.stops })),
  );
  if (trip) {
    pages.push({
      kind: 'trip-map',
      map: trip,
      chapters: chapters.map((c) => ({
        number: c.number,
        title: c.chapter.title,
        firstDay: c.days[0] as string,
        lastDay: c.days.at(-1) as string,
      })),
    });
  }

  let photoCount = 0;
  for (const section of shown) {
    const chapter = chapters.find((c) => c.chapter === section.chapter);
    if (chapter) {
      pages.push({
        kind: 'chapter',
        chapterId: chapter.chapter.id,
        number: chapter.number,
        title: chapter.chapter.title,
        firstDay: chapter.days[0] as string,
        lastDay: chapter.days.at(-1) as string,
        dayCount: chapter.days.length,
        photoCount: chapter.days.reduce((n, d) => n + (byDay.get(d)?.length ?? 0), 0),
        map: chapterRouteMap(chapter.stops),
      });
    }
    for (const dayDate of section.days) {
      const dayPhotos = byDay.get(dayDate) ?? [];
      photoCount += dayPhotos.length;
      pages.push(...dayPages(book, dayDate, dayPhotos));
    }
  }

  pages.push({ kind: 'closing', dayCount: byDay.size, photoCount });
  if (pages.length % 2 === 0) pages.push({ kind: 'blank' });
  pages.push({ kind: 'back-cover' });
  return pages;
}
