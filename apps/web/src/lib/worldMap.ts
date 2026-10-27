import { geoContains, type GeoPermissibleObjects } from 'd3-geo';
import type { LatLng } from '@tb/shared';

/**
 * Colours for a map like a school atlas: each country gets the first colour
 * none of its neighbours has, going through them in order, so two countries
 * sharing a border never share a colour.
 */
export function colourCountries(neighbours: number[][], colours: number): number[] {
  const assigned: number[] = [];
  neighbours.forEach((around, i) => {
    const taken = new Set(around.filter((n) => n < i).map((n) => assigned[n]));
    let colour = i % colours; // start at different colours so the palette spreads
    for (let tries = 0; tries < colours && taken.has(colour); tries++)
      colour = (colour + 1) % colours;
    assigned[i] = colour;
  });
  return assigned;
}

type Point = [number, number];

/**
 * A route between two points on the map as one smooth curve, bowed upwards
 * (a flight path seen from the side): further apart, more bowed.
 */
export function routeCurve(from: Point, to: Point): string {
  const [x1, y1] = from;
  const [x2, y2] = to;
  const length = Math.hypot(x2 - x1, y2 - y1);
  const lift = Math.min(120, 6 + length * 0.28);
  // The control point sits above the middle of the line, perpendicular to it.
  let nx = -(y2 - y1) / (length || 1);
  let ny = (x2 - x1) / (length || 1);
  if (ny > 0) {
    nx = -nx;
    ny = -ny;
  }
  const cx = (x1 + x2) / 2 + nx * lift;
  const cy = (y1 + y2) / 2 + ny * lift;
  const r = (n: number) => n.toFixed(1);
  return `M${r(x1)} ${r(y1)} Q${r(cx)} ${r(cy)} ${r(x2)} ${r(y2)}`;
}

/** Which of the countries (by index) contain at least one of the places. */
export function visitedCountries(
  countries: GeoPermissibleObjects[],
  places: LatLng[],
): Set<number> {
  const visited = new Set<number>();
  for (const p of places) {
    const i = countries.findIndex((c) => geoContains(c, [p.lng, p.lat]));
    if (i >= 0) visited.add(i);
  }
  return visited;
}
