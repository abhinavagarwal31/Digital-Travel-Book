import { distanceKm, type LatLng } from '../organize/geo.ts';

/** One book's journey as the world map draws it: places in the order visited. */
export interface TripPath {
  bookId: string;
  title: string;
  startDate: string;
  points: LatLng[];
}

/** Photos closer than this to the last place count as the same place on a world map. */
export const WORLD_MERGE_KM = 30;
/** Enough to draw a journey; more only clutters a globe the size of a hand. */
export const WORLD_MAX_POINTS = 40;

/**
 * The places of one trip, in time order, for the world map: each photo far
 * enough from the last kept place starts a new one, so a day around one city
 * is one dot, and going back somewhere counts as a new leg of the journey.
 * Long journeys are thinned evenly, always keeping the first and last place.
 */
export function travelPath(
  points: LatLng[],
  mergeKm = WORLD_MERGE_KM,
  max = WORLD_MAX_POINTS,
): LatLng[] {
  const kept: LatLng[] = [];
  for (const p of points) {
    const last = kept.at(-1);
    if (!last || distanceKm(last, p) >= mergeKm) kept.push(p);
  }
  if (kept.length <= max) return kept;
  const step = (kept.length - 1) / (max - 1);
  return Array.from({ length: max }, (_, i) => kept[Math.round(i * step)] as LatLng);
}
