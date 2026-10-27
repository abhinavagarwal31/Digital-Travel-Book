import { distanceKm, type LatLng } from './geo.ts';
import type { OrganizeConfig } from './types.ts';

export interface TimedPoint {
  id: string;
  ms: number;
  point: LatLng;
  /** The user said this location is right: it is never flagged again. */
  confirmed: boolean;
}

const HOUR_MS = 3_600_000;
// Two photos seconds apart would imply absurd speeds from tiny GPS jitter.
const MIN_GAP_MS = 60_000;

interface Leg {
  km: number;
  kmh: number;
}

function leg(a: TimedPoint, b: TimedPoint): Leg {
  const km = distanceKm(a.point, b.point);
  const hours = Math.max(Math.abs(b.ms - a.ms), MIN_GAP_MS) / HOUR_MS;
  return { km, kmh: km / hours };
}

/**
 * GPS readings that are probably wrong. A point is flagged only when reaching
 * it AND leaving it would both need impossible speed over a real distance,
 * while its neighbours agree with each other: the classic single stray fix.
 * A long journey the following photos stay consistent with (a flight) is not
 * flagged, and confirmed points are never flagged.
 */
export function detectOutliers(points: TimedPoint[], config: OrganizeConfig): Set<string> {
  const sorted = [...points].sort((a, b) => a.ms - b.ms || a.id.localeCompare(b.id));
  const flagged = new Set<string>();
  const impossible = (l: Leg) => l.kmh > config.maxKmh && l.km > config.minJumpKm;
  const plausible = (l: Leg) => l.kmh <= config.maxKmh;

  sorted.forEach((current, i) => {
    if (current.confirmed) return;
    const prev = sorted[i - 1];
    const next = sorted[i + 1];

    if (prev && next) {
      if (
        impossible(leg(prev, current)) &&
        impossible(leg(current, next)) &&
        plausible(leg(prev, next))
      ) {
        flagged.add(current.id);
      }
      return;
    }
    // Endpoints have one neighbour; judge them against the next two points on their side.
    const [a, b] = prev ? [prev, sorted[i - 2]] : [next, sorted[i + 2]];
    if (a && b && impossible(leg(current, a)) && plausible(leg(a, b))) flagged.add(current.id);
  });
  return flagged;
}
