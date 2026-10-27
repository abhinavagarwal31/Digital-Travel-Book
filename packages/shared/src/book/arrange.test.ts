import { describe, expect, it } from 'vitest';
import { arrangePhotos, aspectOf, cellsOf } from './arrange.ts';

const WIDE = 4 / 3;
const TALL = 3 / 4;
const PANORAMA = 3;

describe('arrangePhotos', () => {
  it('stacks wide photos and puts tall ones side by side', () => {
    expect(arrangePhotos([WIDE, WIDE])).toBe('rows');
    expect(arrangePhotos([TALL, TALL])).toBe('columns');
    expect(arrangePhotos([PANORAMA, PANORAMA, PANORAMA])).toBe('rows-3');
  });

  it('gives a wide first photo the top, and three tall photos a tall lead', () => {
    expect(arrangePhotos([WIDE, TALL, TALL])).toBe('top-one');
    // Pages are taller than wide, so tall photos make the most of a side column.
    expect(arrangePhotos([TALL, TALL, TALL])).toBe('left-one');
  });

  it('always has a cell for every photo, and is stable for the same photos', () => {
    for (const aspects of [[WIDE], [TALL, WIDE], [WIDE, WIDE, WIDE], [TALL, TALL, TALL, TALL]]) {
      const arrangement = arrangePhotos(aspects);
      expect(cellsOf(arrangement)).toHaveLength(aspects.length);
      expect(arrangePhotos(aspects)).toBe(arrangement);
    }
  });

  it('treats a photo of unknown size as an ordinary 4:3 photo', () => {
    expect(aspectOf({ width: null, height: null })).toBeCloseTo(4 / 3);
    expect(aspectOf({ width: 1200, height: 1600 })).toBeCloseTo(0.75);
  });
});
