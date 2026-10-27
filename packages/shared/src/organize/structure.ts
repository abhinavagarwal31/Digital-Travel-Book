import { medianPoint, distanceKm, type LatLng } from './geo.ts';
import type { Chapter, OrganizablePhoto, OrganizeConfig } from './types.ts';

const DAY_MS = 86_400_000;

function addDays(isoDate: string, days: number): string {
  return new Date(Date.parse(`${isoDate}T00:00:00Z`) + days * DAY_MS).toISOString().slice(0, 10);
}

/** Every date from start to end inclusive. */
export function datesBetween(startDate: string, endDate: string): string[] {
  const dates: string[] = [];
  for (let d = startDate; d <= endDate; d = addDays(d, 1)) dates.push(d);
  return dates;
}

export interface DaySetInput {
  startDate: string;
  endDate: string;
  /** Dates that have a diary entry. */
  diaryDates: string[];
  chapters: Chapter[];
}

/**
 * The book's days, derived rather than stored: the trip range, plus any day a
 * photo is on, plus any day with a diary entry, plus any day a chapter names.
 * Nothing the user wrote or arranged can ever lose its day this way.
 */
export function daySet(input: DaySetInput, photos: OrganizablePhoto[]): string[] {
  const days = new Set(datesBetween(input.startDate, input.endDate));
  for (const p of photos) if (p.status === 'ready' && p.dayDate) days.add(p.dayDate);
  for (const d of input.diaryDates) days.add(d);
  for (const c of input.chapters) for (const d of c.dayDates) days.add(d);
  return [...days].sort();
}

/** Days that put something on the page: a visible photo or a diary entry. */
export function contentDays(photos: OrganizablePhoto[], diaryDates: string[]): string[] {
  const days = new Set(diaryDates);
  for (const p of photos) if (p.status === 'ready' && !p.hidden && p.dayDate) days.add(p.dayDate);
  return [...days].sort();
}

/**
 * Chapters with every content day placed. A day not yet in any chapter joins
 * the chapter holding the nearest earlier day (or, before all chapters, the
 * first one), so a photo moved to a new day can never drop out of the book.
 * Chapter order and titles are untouched. With no chapters, nothing is placed.
 */
export function resolveChapters(chapters: Chapter[], days: string[]): Chapter[] {
  if (chapters.length === 0) return [];
  const result = chapters.map((c) => ({ ...c, dayDates: [...c.dayDates] }));
  const placed = new Set(result.flatMap((c) => c.dayDates));

  for (const day of days) {
    if (placed.has(day)) continue;
    let target = result[0] as Chapter;
    let best = '';
    for (const chapter of result) {
      for (const d of chapter.dayDates) {
        if (d < day && d > best) {
          best = d;
          target = chapter;
        }
      }
    }
    target.dayDates.push(day);
    target.dayDates.sort();
    placed.add(day);
  }
  return result;
}

const shortDate = new Intl.DateTimeFormat('en-GB', {
  day: 'numeric',
  month: 'short',
  timeZone: 'UTC',
});

export function chapterTitle(index: number, days: string[]): string {
  const first = new Date(`${days[0]}T00:00:00Z`);
  const last = new Date(`${days.at(-1)}T00:00:00Z`);
  const range = days.length === 1 ? shortDate.format(first) : shortDate.formatRange(first, last);
  return `Chapter ${index + 1} · ${range.replace(/[\u2009\u202f]/g, ' ')}`;
}

/**
 * Suggested chapters: consecutive content days whose photos centre within
 * `chapterMergeKm` of each other share a chapter; a day without located photos
 * joins the chapter before it. Only a suggestion: the user renames, merges,
 * splits and reorders freely, and once they do, suggestions stop.
 */
export function proposeChapters(
  days: string[],
  dayCentres: ReadonlyMap<string, LatLng>,
  config: OrganizeConfig,
): Chapter[] {
  const groups: { days: string[]; points: LatLng[] }[] = [];
  for (const day of [...days].sort()) {
    const centre = dayCentres.get(day);
    const current = groups.at(-1);
    const sameArea =
      current &&
      (!centre ||
        current.points.length === 0 ||
        distanceKm(medianPoint(current.points), centre) <= config.chapterMergeKm);
    if (current && sameArea) {
      current.days.push(day);
      if (centre) current.points.push(centre);
    } else {
      groups.push({ days: [day], points: centre ? [centre] : [] });
    }
  }
  return groups.map((g, i) => ({
    id: `c-${g.days[0]}`,
    title: chapterTitle(i, g.days),
    dayDates: g.days,
  }));
}

/** A title the app wrote ("Chapter 2 · 12 – 15 Oct"), not one the user typed. */
const AUTO_TITLE = /^Chapter \d+ · .+$/;

/**
 * Keeps the app's own titles true after chapters change shape: numbered in
 * order and naming their dates. Titles the user typed are never touched.
 */
export function refreshAutoTitles(chapters: Chapter[]): Chapter[] {
  return chapters.map((c, i) =>
    AUTO_TITLE.test(c.title) && c.dayDates.length > 0
      ? { ...c, title: chapterTitle(i, c.dayDates) }
      : c,
  );
}

/** An id like `c-2026-10-12`, made unique among the others if needed. */
function freshId(base: string, chapters: Chapter[]): string {
  const taken = new Set(chapters.map((c) => c.id));
  let id = base;
  for (let n = 2; taken.has(id); n++) id = `${base}-${n}`;
  return id;
}

/** Starts a new chapter at `day`: it and the later days of its chapter move into it. */
export function splitChapter(chapters: Chapter[], day: string): Chapter[] {
  const at = chapters.findIndex((c) => c.dayDates.includes(day));
  const chapter = chapters[at];
  if (!chapter || chapter.dayDates[0] === day) return chapters;
  const sorted = [...chapter.dayDates].sort();
  const before = sorted.filter((d) => d < day);
  const after = sorted.filter((d) => d >= day);
  const created: Chapter = {
    id: freshId(`c-${day}`, chapters),
    title: chapterTitle(at + 1, after),
    dayDates: after,
  };
  return refreshAutoTitles([
    ...chapters.slice(0, at),
    { ...chapter, dayDates: before },
    created,
    ...chapters.slice(at + 1),
  ]);
}

/** Joins a chapter onto the one before it, which keeps its title. */
export function mergeWithPrevious(chapters: Chapter[], chapterId: string): Chapter[] {
  const at = chapters.findIndex((c) => c.id === chapterId);
  const previous = chapters[at - 1];
  const chapter = chapters[at];
  if (!previous || !chapter) return chapters;
  return refreshAutoTitles([
    ...chapters.slice(0, at - 1),
    { ...previous, dayDates: [...previous.dayDates, ...chapter.dayDates].sort() },
    ...chapters.slice(at + 1),
  ]);
}

export function renameChapter(chapters: Chapter[], chapterId: string, title: string): Chapter[] {
  return chapters.map((c) => (c.id === chapterId ? { ...c, title } : c));
}
