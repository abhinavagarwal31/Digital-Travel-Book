import { geoDistance, geoInterpolate, geoRotation } from 'd3-geo';
import type { LatLng } from '@tb/shared';

/** [longitude, latitude], as d3-geo takes points. */
type LonLat = [number, number];

const toLonLat = (p: LatLng): LonLat => [p.lng, p.lat];

/** A point of a lifted arc: where it is over the globe, and how high (share of the radius). */
export interface ArcPoint {
  lonLat: LonLat;
  altitude: number;
}

/**
 * The path between two places as a flight would draw it: along the shortest
 * route over the globe, rising off the surface and coming back down. Longer
 * journeys fly higher, so a hop to the next city stays low and a crossing of
 * an ocean arcs well above the map.
 */
export function liftedArc(a: LatLng, b: LatLng, segments = 48): ArcPoint[] {
  const from = toLonLat(a);
  const to = toLonLat(b);
  const along = geoInterpolate(from, to);
  const span = geoDistance(from, to); // radians, 0…π
  const peak = Math.min(0.32, 0.03 + span * 0.28);
  return Array.from({ length: segments + 1 }, (_, i) => {
    const t = i / segments;
    return { lonLat: along(t) as LonLat, altitude: peak * Math.sin(Math.PI * t) };
  });
}

export interface ScreenPoint {
  x: number;
  y: number;
  /** False when the globe itself is in front of the point. */
  visible: boolean;
}

/**
 * Where a point (possibly above the surface) appears on an orthographic globe
 * of radius r centred at (cx, cy), turned by `rotate` ([λ, φ], d3's order).
 * A point behind the globe is hidden unless it rises far enough to be seen
 * past the edge.
 */
export function projectLifted(
  lonLat: LonLat,
  altitude: number,
  rotate: [number, number],
  r: number,
  cx: number,
  cy: number,
): ScreenPoint {
  const [lon, lat] = geoRotation([rotate[0], rotate[1], 0])(lonLat);
  const λ = (lon * Math.PI) / 180;
  const φ = (lat * Math.PI) / 180;
  const x = Math.cos(φ) * Math.sin(λ);
  const y = Math.sin(φ);
  const z = Math.cos(φ) * Math.cos(λ);
  const scale = r * (1 + altitude);
  const fromCentre = Math.hypot(x, y) * (1 + altitude);
  return {
    x: cx + scale * x,
    y: cy - scale * y,
    visible: z >= 0 || fromCentre > 1,
  };
}

/** A starting view that faces the trips: the middle of all their places. */
export function facing(points: LatLng[]): [number, number] {
  if (points.length === 0) return [-78, -20]; // India and the Indian Ocean
  // Average on the unit sphere, so places either side of the date line agree.
  let x = 0;
  let y = 0;
  let z = 0;
  for (const p of points) {
    const λ = (p.lng * Math.PI) / 180;
    const φ = (p.lat * Math.PI) / 180;
    x += Math.cos(φ) * Math.cos(λ);
    y += Math.cos(φ) * Math.sin(λ);
    z += Math.sin(φ);
  }
  const lng = (Math.atan2(y, x) * 180) / Math.PI;
  const lat = (Math.atan2(z, Math.hypot(x, y)) * 180) / Math.PI;
  // Tilted a little less than the true middle, so the poles never fill the view.
  return [-lng, -Math.max(-35, Math.min(35, lat))];
}
