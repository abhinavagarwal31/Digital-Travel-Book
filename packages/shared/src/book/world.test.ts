import { describe, expect, it } from 'vitest';
import { travelPath } from './world.ts';

const JAIPUR = { lat: 26.92, lng: 75.82 };
const AMBER = { lat: 26.99, lng: 75.85 }; // 8 km away
const JODHPUR = { lat: 26.3, lng: 73.02 };

describe('travelPath', () => {
  it('makes one place of a city, and a new one for each city reached', () => {
    expect(travelPath([JAIPUR, AMBER, JAIPUR, JODHPUR])).toEqual([JAIPUR, JODHPUR]);
  });

  it('counts going back as another leg of the journey', () => {
    expect(travelPath([JAIPUR, JODHPUR, JAIPUR])).toEqual([JAIPUR, JODHPUR, JAIPUR]);
  });

  it('thins a long journey evenly, keeping where it started and ended', () => {
    const many = Array.from({ length: 100 }, (_, i) => ({ lat: 0, lng: -170 + i * 3.4 }));
    const path = travelPath(many, 30, 10);
    expect(path).toHaveLength(10);
    expect(path[0]).toEqual(many[0]);
    expect(path.at(-1)).toEqual(many.at(-1));
  });

  it('is empty without places', () => {
    expect(travelPath([])).toEqual([]);
  });
});
