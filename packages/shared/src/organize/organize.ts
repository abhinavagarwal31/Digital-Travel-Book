import { dayDateOf, isOutsideTrip } from '../photos/time.ts';
import type { PhotoFlag } from '../schemas/photo.ts';
import { medianPoint, type LatLng } from './geo.ts';
import { detectOutliers } from './outliers.ts';
import { usableLocation } from './stops.ts';
import { contentDays, proposeChapters, resolveChapters } from './structure.ts';
import {
  DEFAULT_ORGANIZE_CONFIG,
  type Chapter,
  type OrganizablePhoto,
  type OrganizeConfig,
} from './types.ts';

export interface OrganizeBook {
  startDate: string;
  endDate: string;
  diaryDates: string[];
  chapters: Chapter[];
  /** True once the user has changed chapters; suggestions then stop. */
  chaptersEdited: boolean;
}

export interface PhotoChange {
  id: string;
  dayDate: string | null;
  flags: PhotoFlag[];
}

export interface OrganizeResult {
  /** Only photos whose day or flags differ from what is stored. */
  photoChanges: PhotoChange[];
  chapters: Chapter[];
}

const sameFlags = (a: PhotoFlag[], b: PhotoFlag[]) =>
  a.length === b.length && [...a].sort().join() === [...b].sort().join();

/**
 * Re-derives everything automatic and nothing the user decided:
 * - auto photos get their day from their wall clock and the trip dates;
 *   photos the user placed (or deliberately left unsorted) are never moved;
 * - `outside_trip` and `gps_outlier` flags are recomputed; flags set at
 *   upload from the photo's own metadata (no_time, tz_assumed) are kept;
 * - chapters are suggested until the user edits them; after that only days
 *   not yet in any chapter are placed, next to their neighbours.
 * Pure and deterministic: the same inputs always give the same result.
 */
export function organize(
  photos: OrganizablePhoto[],
  book: OrganizeBook,
  config: OrganizeConfig = DEFAULT_ORGANIZE_CONFIG,
): OrganizeResult {
  const ready = photos.filter((p) => p.status === 'ready');

  const outliers = detectOutliers(
    ready
      .filter((p) => !p.hidden && p.capturedAt && p.gps && p.gpsStatus !== 'removed')
      .map((p) => ({
        id: p.id,
        ms: Date.parse(p.capturedAt as string),
        point: p.gps as LatLng,
        confirmed: p.gpsStatus === 'confirmed',
      })),
    config,
  );

  const after = new Map<string, { dayDate: string | null; flags: PhotoFlag[] }>();
  const photoChanges: PhotoChange[] = [];
  for (const photo of ready) {
    const kept = photo.flags.filter((f) => f === 'no_time' || f === 'tz_assumed');
    const flags: PhotoFlag[] = [...kept];
    let dayDate = photo.dayDate;

    const ownDay = dayDateOf(photo.localDateTime);
    const outside = ownDay !== null && isOutsideTrip(ownDay, book.startDate, book.endDate);
    if (outside) flags.push('outside_trip');
    if (photo.assignedBy === 'auto') dayDate = outside ? null : ownDay;
    if (outliers.has(photo.id)) flags.push('gps_outlier');

    after.set(photo.id, { dayDate, flags });
    if (dayDate !== photo.dayDate || !sameFlags(flags, photo.flags)) {
      photoChanges.push({ id: photo.id, dayDate, flags });
    }
  }

  const updated = ready.map((p) => ({ ...p, ...after.get(p.id) }) as OrganizablePhoto);
  const days = contentDays(updated, book.diaryDates);

  let chapters: Chapter[];
  if (book.chaptersEdited) {
    chapters = resolveChapters(book.chapters, days);
  } else {
    const centres = new Map<string, LatLng>();
    for (const day of days) {
      const points = updated
        .filter((p) => p.dayDate === day && !p.hidden && usableLocation(p, outliers))
        .map((p) => p.gps as LatLng);
      if (points.length > 0) centres.set(day, medianPoint(points));
    }
    chapters = proposeChapters(days, centres, config);
  }

  return { photoChanges, chapters };
}
