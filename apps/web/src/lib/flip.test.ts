import { describe, expect, it } from 'vitest';
import { leafCount, leafPages, leafZIndex, turnedForPage, visiblePages } from './flip.ts';

describe('double-page spreads', () => {
  // Pages: 0 cover, 1 endpaper, 2 title, 3 day, 4 photos, 5 closing.
  const pages = 6;

  it('puts two pages on each leaf', () => {
    expect(leafCount(pages, 'double')).toBe(3);
    expect(leafPages(0, pages, 'double')).toEqual([0, 1]);
    expect(leafPages(2, pages, 'double')).toEqual([4, 5]);
    expect(leafPages(1, 5, 'double')).toEqual([2, 3]);
    expect(leafPages(2, 5, 'double')).toEqual([4, null]);
  });

  it('shows the closed cover, then spreads, then the back', () => {
    expect(visiblePages(0, pages, 'double')).toEqual([0]);
    expect(visiblePages(1, pages, 'double')).toEqual([1, 2]);
    expect(visiblePages(2, pages, 'double')).toEqual([3, 4]);
    expect(visiblePages(3, pages, 'double')).toEqual([5]);
  });

  it('opens to the spread containing any page', () => {
    for (let page = 0; page < pages; page++) {
      expect(visiblePages(turnedForPage(page, 'double'), pages, 'double')).toContain(page);
    }
  });
});

describe('single pages', () => {
  it('turns one page at a time', () => {
    expect(leafCount(5, 'single')).toBe(5);
    expect(leafPages(3, 5, 'single')).toEqual([3, null]);
    expect(visiblePages(3, 5, 'single')).toEqual([3]);
    expect(turnedForPage(4, 'single')).toBe(4);
  });
});

describe('stacking', () => {
  it('keeps the next leaf to turn on top of the right-hand stack', () => {
    expect(leafZIndex(2, 2, 5)).toBeGreaterThan(leafZIndex(3, 2, 5));
  });

  it('keeps the last-turned leaf on top of the left-hand stack', () => {
    expect(leafZIndex(1, 2, 5)).toBeGreaterThan(leafZIndex(0, 2, 5));
  });

  it('lifts leaves in flight above all others, later flights on top', () => {
    const resting = Math.max(...[0, 1, 2, 3, 4].map((leaf) => leafZIndex(leaf, 2, 5)));
    expect(leafZIndex(2, 3, 5, { direction: 1 })).toBeGreaterThan(resting);
    // Riffling forward, leaf 3 leaves after leaf 2 and must land on top of it.
    expect(leafZIndex(3, 4, 5, { direction: 1 })).toBeGreaterThan(
      leafZIndex(2, 4, 5, { direction: 1 }),
    );
    // Riffling back, leaf 1 returns after leaf 2 and must land on top of it.
    expect(leafZIndex(1, 1, 5, { direction: -1 })).toBeGreaterThan(
      leafZIndex(2, 1, 5, { direction: -1 }),
    );
  });
});
