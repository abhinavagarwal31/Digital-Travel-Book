import { computeStops, type Stop } from '../organize/stops.ts';
import { contentDays, resolveChapters } from '../organize/structure.ts';
import { DEFAULT_ORGANIZE_CONFIG, type Chapter, type OrganizablePhoto } from '../organize/types.ts';
import { tripLengthDays } from '../schemas/book.ts';
import { LAYOUT_CAPACITY, type PhotoLayout, type ThemeDefinition } from '../themes/definition.ts';
import { chapterRouteMap, tripRouteMap, type RouteMap } from './maps.ts';
import { DIARY_BUDGET, paginateText } from './paginate.ts';

/** The book's pages, derived from travel data on every render and never stored. */
export type BookPage =
  | {
      kind: 'cover';
      /** The owner's chosen cover photo, or null for the plain cloth cover. */
      photoId: string | null;
    }
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
      heroCaption: string;
      photoCount: number;
      /** First and last local times of the day's photos, when known ("08:05"). */
      timeRange: [string, string] | null;
    }
  | {
      kind: 'diary';
      dayDate: string;
      dayNumber: number;
      paragraphs: string[];
      /** The first paragraph carries on from the page before. */
      continued: boolean;
      /** The day has no photos, so this page opens it and carries its heading. */
      opensDay: boolean;
    }
  | {
      kind: 'photos';
      dayDate: string;
      photoIds: string[];
      /** Captions by photo id; photos without one are not listed. */
      captions: Record<string, string>;
    }
  | { kind: 'closing'; dayCount: number; photoCount: number }
  | { kind: 'blank' }
  | { kind: 'back-cover' };

/** The photo fields composition needs (locations too, for the maps); the API's Photo fits. */
export type ComposablePhoto = OrganizablePhoto & { caption: string };

export interface ComposableBook {
  startDate: string;
  /** Diary entries; a day with one belongs to a chapter even without photos. */
  days: { date: string; diary: string }[];
  /** The stored chapters. With none, the days follow the title page directly. */
  chapters: Chapter[];
  overrides: {
    coverPhotoId: string | null;
    dayLayouts: { date: string; layout: PhotoLayout }[];
  };
}

/**
 * How many photos go on each page after a day's opener: groups of up to `max`,
 * never leaving a single photo alone after a full page (with four a page,
 * 5 → 3 + 2; with three, 4 → 2 + 2).
 */
export function chunkSizes(count: number, max = 4): number[] {
  const sizes: number[] = [];
  let left = count;
  while (left > 0) {
    const size = left <= max ? left : left === max + 1 && max > 2 ? max - 1 : max;
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

/**
 * A day: its opener (the first photo as hero), the diary, then the remaining
 * photos four or fewer to a page. A day with a diary but no photos opens on
 * its first diary page instead.
 */
function dayPages(
  book: ComposableBook,
  dayDate: string,
  photos: ComposablePhoto[],
  diary: string,
  perPage: number,
): BookPage[] {
  const dayNumber = tripLengthDays(book.startDate, dayDate);
  const [hero, ...rest] = inTimeOrder(photos);
  const pages: BookPage[] = [];
  if (hero) {
    const times = photos.flatMap((p) => (p.localDateTime ? [clock(p.localDateTime)] : [])).sort();
    pages.push({
      kind: 'day',
      dayDate,
      dayNumber,
      heroPhotoId: hero.id,
      heroCaption: hero.caption,
      photoCount: photos.length,
      timeRange: times.length > 0 ? [times[0] as string, times.at(-1) as string] : null,
    });
  }
  // Only a diary that opens the day shares its first page with the day's heading.
  const budget = hero
    ? { ...DIARY_BUDGET, firstPageLines: DIARY_BUDGET.linesPerPage }
    : DIARY_BUDGET;
  paginateText(diary, budget).forEach((text, i) => {
    pages.push({ kind: 'diary', dayDate, dayNumber, ...text, opensDay: !hero && i === 0 });
  });
  let offset = 0;
  for (const size of chunkSizes(rest.length, perPage)) {
    const chunk = rest.slice(offset, offset + size);
    pages.push({
      kind: 'photos',
      dayDate,
      photoIds: chunk.map((p) => p.id),
      captions: Object.fromEntries(chunk.filter((p) => p.caption).map((p) => [p.id, p.caption])),
    });
    offset += size;
  }
  return pages;
}

/**
 * Deterministic page plan: cover, endpaper, title page, a map of the whole
 * trip (when two or more chapters have places on it), then each chapter: an
 * opener with its own map, then its days: an opener (the first photo as
 * hero), the diary, and the remaining photos in time order. Then a closing page
 * and the back cover. The theme decides how many photos share a page, unless
 * the owner chose a layout for that day the theme also offers. Like a printed book it has an even number of pages, so
 * the back cover is always the back of the last leaf.
 *
 * Photos without a day, hidden photos and photos still uploading are left
 * out; so are locations flagged as suspicious until the user confirms them.
 * The same inputs always give the same pages.
 */
export function composeBook(
  book: ComposableBook,
  photos: ComposablePhoto[],
  theme: ThemeDefinition,
): BookPage[] {
  // A day's own layout applies only if this theme offers it; otherwise the theme's default.
  const allowed = new Set<PhotoLayout>(theme.photos.layouts);
  const dayLayouts = new Map(
    book.overrides.dayLayouts.filter((d) => allowed.has(d.layout)).map((d) => [d.date, d.layout]),
  );
  const perPage = (dayDate: string) =>
    LAYOUT_CAPACITY[dayLayouts.get(dayDate) ?? theme.photos.defaultLayout];
  const inBook = photos.filter((p) => p.status === 'ready' && !p.hidden && p.dayDate);
  const byDay = new Map<string, ComposablePhoto[]>();
  for (const photo of inBook) {
    const day = byDay.get(photo.dayDate as string) ?? [];
    day.push(photo);
    byDay.set(photo.dayDate as string, day);
  }

  // Chapters as the reader sees them: every day with photos or a diary
  // entry placed, and only chapters with something on the page.
  const diaries = new Map(
    book.days.filter((d) => d.diary.trim() !== '').map((d) => [d.date, d.diary]),
  );
  const days = contentDays(inBook, [...diaries.keys()]);
  const resolved = resolveChapters(book.chapters, days);
  const sections: { chapter: Chapter | null; days: string[] }[] =
    resolved.length === 0
      ? [{ chapter: null, days }]
      : resolved.map((chapter) => ({
          chapter,
          days: chapter.dayDates.filter((d) => days.includes(d)),
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

  // A cover photo that has since been hidden, deleted or left out is ignored.
  const coverPhotoId = inBook.some((p) => p.id === book.overrides.coverPhotoId)
    ? book.overrides.coverPhotoId
    : null;
  const pages: BookPage[] = [
    { kind: 'cover', photoId: coverPhotoId },
    { kind: 'endpaper' },
    { kind: 'title' },
  ];
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
      pages.push(
        ...dayPages(book, dayDate, dayPhotos, diaries.get(dayDate) ?? '', perPage(dayDate)),
      );
    }
  }

  pages.push({ kind: 'closing', dayCount: days.length, photoCount });
  if (pages.length % 2 === 0) pages.push({ kind: 'blank' });
  pages.push({ kind: 'back-cover' });
  return pages;
}
