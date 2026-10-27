import { distanceKm, medianPoint, type LatLng } from './geo.ts';
import type { OrganizablePhoto, OrganizeConfig } from './types.ts';

/** A place photographed in one continuous visit. Computed, never stored. */
export interface Stop {
  /** The id of the stop's first located photo: stable while the data is unchanged. */
  id: string;
  /** Median of the located photos' positions; the map pin goes here. */
  point: LatLng;
  start: string; // ISO
  end: string; // ISO
  /** Photos that define the position. */
  locatedPhotoIds: string[];
  /** Photos without GPS taken during the visit: members only, never given coordinates. */
  unlocatedPhotoIds: string[];
}

const MINUTE_MS = 60_000;

/** Whether a photo's own position may be used for stops and maps. */
export function usableLocation(photo: OrganizablePhoto, outliers: ReadonlySet<string>): boolean {
  return (
    photo.gps !== null &&
    photo.gpsStatus !== 'removed' &&
    (!outliers.has(photo.id) || photo.gpsStatus === 'confirmed')
  );
}

/**
 * Groups photos into stops in one pass in time order. A photo joins the current
 * stop when it is close to the stop's median AND soon after its last photo, so
 * coming back to the same place later starts a new stop. Clustering by place
 * alone (DBSCAN) would merge those separate visits.
 */
export function computeStops(
  photos: OrganizablePhoto[],
  outliers: ReadonlySet<string>,
  config: OrganizeConfig,
): Stop[] {
  const inBook = photos.filter((p) => p.status === 'ready' && !p.hidden && p.capturedAt);
  const ms = (p: OrganizablePhoto) => Date.parse(p.capturedAt as string);
  const byTime = (a: OrganizablePhoto, b: OrganizablePhoto) =>
    ms(a) - ms(b) || a.id.localeCompare(b.id);

  const located = inBook.filter((p) => usableLocation(p, outliers)).sort(byTime);
  const stops: { photos: OrganizablePhoto[]; points: LatLng[]; last: number }[] = [];

  for (const photo of located) {
    const current = stops.at(-1);
    const near =
      current &&
      distanceKm(medianPoint(current.points), photo.gps as LatLng) * 1000 <= config.stopRadiusM &&
      ms(photo) - current.last <= config.stopGapMin * MINUTE_MS;
    if (near && current) {
      current.photos.push(photo);
      current.points.push(photo.gps as LatLng);
      current.last = ms(photo);
    } else {
      stops.push({ photos: [photo], points: [photo.gps as LatLng], last: ms(photo) });
    }
  }

  const result: Stop[] = stops.map((s) => ({
    id: (s.photos[0] as OrganizablePhoto).id,
    point: medianPoint(s.points),
    start: (s.photos[0] as OrganizablePhoto).capturedAt as string,
    end: (s.photos.at(-1) as OrganizablePhoto).capturedAt as string,
    locatedPhotoIds: s.photos.map((p) => p.id),
    unlocatedPhotoIds: [],
  }));

  // A timed photo without a usable location belongs to the stop whose visit it falls inside.
  for (const photo of inBook.filter((p) => !usableLocation(p, outliers)).sort(byTime)) {
    const t = ms(photo);
    const stop = result.find((s) => Date.parse(s.start) <= t && t <= Date.parse(s.end));
    stop?.unlocatedPhotoIds.push(photo.id);
  }
  return result;
}
