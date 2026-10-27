import { describe, expect, it } from 'vitest';
import {
  fitMap,
  MAP_STYLES,
  MAX_ZOOM,
  project,
  SINGLE_PIN_ZOOM,
  unwrapLongitudes,
} from './staticMap.ts';

const STYLE = MAP_STYLES.atlas;
const TOKYO = { lat: 35.68, lng: 139.76 };
const KYOTO = { lat: 35.01, lng: 135.77 };

describe('project', () => {
  it('puts null island in the middle of the world and the date line at its edges', () => {
    expect(project({ lat: 0, lng: 0 }, 0)).toEqual({ x: 128, y: 128 });
    expect(project({ lat: 0, lng: -180 }, 1).x).toBe(0);
    expect(project({ lat: 0, lng: 180 }, 1).x).toBe(512);
  });
});

describe('fitMap', () => {
  it('keeps every place inside the frame, clear of the edges', () => {
    const view = fitMap([TOKYO, KYOTO], 600, 480, STYLE);
    for (const p of view.points) {
      expect(p.x).toBeGreaterThanOrEqual(48);
      expect(p.x).toBeLessThanOrEqual(600 - 48);
      expect(p.y).toBeGreaterThanOrEqual(48);
      expect(p.y).toBeLessThanOrEqual(480 - 48);
    }
  });

  it('uses the closest zoom that fits: one step closer would not', () => {
    const view = fitMap([TOKYO, KYOTO], 600, 480, STYLE);
    const width = (z: number) => project(TOKYO, z).x - project(KYOTO, z).x;
    expect(width(view.zoom)).toBeLessThanOrEqual(600 - 96);
    expect(width(view.zoom + 1)).toBeGreaterThan(600 - 96);
  });

  it('never zooms past street level, and shows a lone place at neighbourhood scale', () => {
    expect(fitMap([TOKYO, { lat: 35.6801, lng: 139.7601 }], 600, 480, STYLE).zoom).toBe(MAX_ZOOM);
    const lone = fitMap([TOKYO], 600, 480, STYLE);
    expect(lone.zoom).toBe(SINGLE_PIN_ZOOM);
    expect(lone.points).toEqual([{ x: 300, y: 240 }]);
  });

  it('covers the whole frame with tiles and no more', () => {
    const view = fitMap([TOKYO, KYOTO], 600, 480, STYLE);
    for (const t of view.tiles) {
      expect(t.left).toBeGreaterThan(-256);
      expect(t.left).toBeLessThan(600);
      expect(t.top).toBeGreaterThan(-256);
      expect(t.top).toBeLessThan(480);
    }
    // Every corner of the frame is under some tile.
    for (const [x, y] of [
      [0, 0],
      [599, 0],
      [0, 479],
      [599, 479],
    ] as const) {
      expect(
        view.tiles.some((t) => t.left <= x && x < t.left + 256 && t.top <= y && y < t.top + 256),
      ).toBe(true);
    }
    expect(view.tiles[0]?.url).toMatch(
      /^https:\/\/tiles\.stadiamaps\.com\/tiles\/stamen_watercolor\/\d+\/\d+\/\d+@2x\.jpg$/,
    );
  });

  it('draws a trip across the date line across the ocean, not around the world', () => {
    const honolulu = { lat: 21.3, lng: -157.86 };
    expect(unwrapLongitudes([TOKYO, honolulu])[1]?.lng).toBeCloseTo(202.14);
    const view = fitMap([TOKYO, honolulu], 600, 480, STYLE);
    expect(view.zoom).toBeGreaterThanOrEqual(2);
    // Tile numbers wrap back into the world.
    for (const t of view.tiles) {
      const [, x] = t.url.match(/\/\d+\/(\d+)\/\d+@/) ?? [];
      expect(Number(x)).toBeLessThan(2 ** view.zoom);
    }
  });

  it('leaves the poles to the background instead of asking for tiles that do not exist', () => {
    const view = fitMap([{ lat: 84, lng: 0 }], 600, 480, STYLE);
    for (const t of view.tiles) {
      const [, y] = t.url.match(/\/(\d+)@/) ?? [];
      expect(Number(y)).toBeGreaterThanOrEqual(0);
    }
  });
});
