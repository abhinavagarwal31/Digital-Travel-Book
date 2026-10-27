import { medianPoint, type LatLng } from '../organize/geo.ts';
import type { Stop } from '../organize/stops.ts';

/** A numbered pin: a place photographed (chapter map) or a chapter (trip map). */
export interface MapPin {
  id: string;
  number: number;
  point: LatLng;
}

/** A straight line between two pins in the order they were photographed. */
export interface MapSegment {
  from: LatLng;
  to: LatLng;
  /** Drawn fainter: a long gap (overnight, a journey) between the two places. */
  faint: boolean;
}

/** What a map shows, independent of how it is drawn. Never a claim about the route taken. */
export interface RouteMap {
  pins: MapPin[];
  segments: MapSegment[];
}

/** Longer than this between leaving one place and reaching the next draws the line fainter. */
export const FAINT_GAP_MS = 6 * 3_600_000;

/**
 * A chapter's map: one numbered pin per stop in time order, joined by straight
 * lines. No stops gives no map; one stop gives a single pin and no line.
 */
export function chapterRouteMap(stops: Stop[]): RouteMap | null {
  if (stops.length === 0) return null;
  const ordered = [...stops].sort((a, b) => a.start.localeCompare(b.start));
  const segments: MapSegment[] = [];
  for (let i = 1; i < ordered.length; i++) {
    const prev = ordered[i - 1] as Stop;
    const next = ordered[i] as Stop;
    segments.push({
      from: prev.point,
      to: next.point,
      faint: Date.parse(next.start) - Date.parse(prev.end) > FAINT_GAP_MS,
    });
  }
  return {
    pins: ordered.map((s, i) => ({ id: s.id, number: i + 1, point: s.point })),
    segments,
  };
}

/**
 * The whole trip: one pin per chapter at the centre of its places, numbered
 * as the chapters are, joined in reading order. Chapters without a located
 * photo get no pin. Only worth a page with two or more pins.
 */
export function tripRouteMap(
  chapters: { id: string; number: number; stops: Stop[] }[],
): RouteMap | null {
  const pins: MapPin[] = chapters
    .filter((c) => c.stops.length > 0)
    .map((c) => ({ id: c.id, number: c.number, point: medianPoint(c.stops.map((s) => s.point)) }));
  if (pins.length < 2) return null;
  const segments = pins
    .slice(1)
    .map((pin, i) => ({ from: (pins[i] as MapPin).point, to: pin.point, faint: false }));
  return { pins, segments };
}
