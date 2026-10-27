import { describe, expect, it } from 'vitest';
import type { Stop } from '../organize/stops.ts';
import { chapterRouteMap, tripRouteMap } from './maps.ts';

function stop(id: string, lat: number, start: string, end = start): Stop {
  return {
    id,
    point: { lat, lng: 139 },
    start: `2026-10-10T${start}:00.000Z`,
    end: `2026-10-10T${end}:00.000Z`,
    locatedPhotoIds: [id],
    unlocatedPhotoIds: [],
  };
}

describe('chapterRouteMap', () => {
  it('has no map without places, and a single pin with no line for one place', () => {
    expect(chapterRouteMap([])).toBeNull();
    expect(chapterRouteMap([stop('a', 35, '09:00')])).toEqual({
      pins: [{ id: 'a', number: 1, point: { lat: 35, lng: 139 } }],
      segments: [],
    });
  });

  it('numbers places in time order and joins them in that order', () => {
    const map = chapterRouteMap([
      stop('c', 37, '15:00'),
      stop('a', 35, '09:00'),
      stop('b', 36, '11:00'),
    ]);
    expect(map?.pins.map((p) => [p.id, p.number])).toEqual([
      ['a', 1],
      ['b', 2],
      ['c', 3],
    ]);
    expect(map?.segments.map((s) => [s.from.lat, s.to.lat])).toEqual([
      [35, 36],
      [36, 37],
    ]);
  });

  it('draws a line fainter only when more than six hours pass between two places', () => {
    const map = chapterRouteMap([
      stop('a', 35, '01:00', '02:00'),
      stop('b', 36, '08:00'), // exactly six hours after leaving a
      stop('c', 37, '14:01'), // six hours and a minute after b
    ]);
    expect(map?.segments.map((s) => s.faint)).toEqual([false, true]);
  });
});

describe('tripRouteMap', () => {
  it('puts one pin per chapter at the centre of its places, keeping chapter numbers', () => {
    const map = tripRouteMap([
      {
        id: 'tokyo',
        number: 1,
        stops: [stop('a', 35, '09:00'), stop('b', 35.2, '10:00'), stop('x', 40, '11:00')],
      },
      { id: 'no-gps', number: 2, stops: [] },
      { id: 'kyoto', number: 3, stops: [stop('c', 34, '12:00')] },
    ]);
    expect(map?.pins).toEqual([
      { id: 'tokyo', number: 1, point: { lat: 35.2, lng: 139 } },
      { id: 'kyoto', number: 3, point: { lat: 34, lng: 139 } },
    ]);
    expect(map?.segments).toEqual([
      { from: { lat: 35.2, lng: 139 }, to: { lat: 34, lng: 139 }, faint: false },
    ]);
  });

  it('is not worth a page with fewer than two chapters on it', () => {
    expect(tripRouteMap([{ id: 'a', number: 1, stops: [stop('a', 35, '09:00')] }])).toBeNull();
    expect(tripRouteMap([])).toBeNull();
  });
});
