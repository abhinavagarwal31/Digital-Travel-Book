import { describe, expect, it } from 'vitest';
import { chunkSizes, composeBook, type ComposablePhoto } from './compose.ts';

const BOOK = { startDate: '2026-10-10' };

let nextId = 0;
function photo(dayDate: string | null, time: string | null, extra: Partial<ComposablePhoto> = {}) {
  return {
    id: `p${String(nextId++).padStart(3, '0')}`,
    status: 'ready',
    hidden: false,
    dayDate,
    localDateTime: time && dayDate ? `${dayDate}T${time}` : null,
    ...extra,
  };
}

describe('chunkSizes', () => {
  it.each([
    [0, []],
    [1, [1]],
    [4, [4]],
    [5, [3, 2]],
    [6, [4, 2]],
    [8, [4, 4]],
    [9, [4, 3, 2]],
    [13, [4, 4, 3, 2]],
  ])('splits %i photos as %j', (count, sizes) => {
    expect(chunkSizes(count)).toEqual(sizes);
    expect(sizes.reduce((a, b) => a + b, 0)).toBe(count);
  });
});

describe('composeBook', () => {
  it('builds front matter, one opener per day, photo pages in time order and a closing page', () => {
    const late = photo('2026-10-12', '18:30:00');
    const early = photo('2026-10-12', '08:05:00');
    const mid = photo('2026-10-12', '12:00:00');
    const day1 = photo('2026-10-10', '10:15:00');
    const pages = composeBook(BOOK, [late, day1, mid, early]);

    expect(pages).toEqual([
      { kind: 'cover' },
      { kind: 'endpaper' },
      { kind: 'title' },
      {
        kind: 'day',
        dayDate: '2026-10-10',
        dayNumber: 1,
        heroPhotoId: day1.id,
        photoCount: 1,
        timeRange: ['10:15', '10:15'],
      },
      {
        kind: 'day',
        dayDate: '2026-10-12',
        dayNumber: 3,
        heroPhotoId: early.id,
        photoCount: 3,
        timeRange: ['08:05', '18:30'],
      },
      { kind: 'photos', dayDate: '2026-10-12', photoIds: [mid.id, late.id] },
      { kind: 'closing', dayCount: 2, photoCount: 4 },
      { kind: 'back-cover' },
    ]);
  });

  it('leaves out undated, hidden and unfinished photos, and never invents a day', () => {
    const pages = composeBook(BOOK, [
      photo(null, null),
      photo('2026-10-11', '09:00:00', { hidden: true }),
      photo('2026-10-11', '10:00:00', { status: 'pending' }),
    ]);
    expect(pages.map((p) => p.kind)).toEqual([
      'cover',
      'endpaper',
      'title',
      'closing',
      'blank',
      'back-cover',
    ]);
    expect(pages[3]).toEqual({ kind: 'closing', dayCount: 0, photoCount: 0 });
  });

  it('puts photos without a time after timed ones and reports no time range for an untimed day', () => {
    const timed = photo('2026-10-11', '09:00:00');
    const untimed = { ...photo('2026-10-11', null), localDateTime: null };
    const onlyUntimed = { ...photo('2026-10-13', null), localDateTime: null };
    const pages = composeBook(BOOK, [untimed, timed, onlyUntimed]);

    expect(pages[3]).toMatchObject({ heroPhotoId: timed.id, timeRange: ['09:00', '09:00'] });
    expect(pages[4]).toEqual({ kind: 'photos', dayDate: '2026-10-11', photoIds: [untimed.id] });
    expect(pages[5]).toMatchObject({ kind: 'day', dayDate: '2026-10-13', timeRange: null });
  });

  it('is deterministic regardless of input order', () => {
    const photos = Array.from({ length: 11 }, (_, i) =>
      photo(`2026-10-1${i % 3}`, `${String(8 + i).padStart(2, '0')}:00:00`),
    );
    const shuffled = [...photos].reverse();
    expect(composeBook(BOOK, shuffled)).toEqual(composeBook(BOOK, photos));
  });

  it('always has an even number of pages, ending on the back cover', () => {
    for (let n = 0; n < 12; n++) {
      const pages = composeBook(
        BOOK,
        Array.from({ length: n }, (_, i) =>
          photo('2026-10-11', `${String(8 + i).padStart(2, '0')}:00:00`),
        ),
      );
      expect(pages.length % 2).toBe(0);
      expect(pages.at(-1)).toEqual({ kind: 'back-cover' });
    }
  });

  it('numbers days from the trip start, including the day before it', () => {
    const pages = composeBook(BOOK, [photo('2026-10-09', '22:00:00')]);
    expect(pages[3]).toMatchObject({ dayDate: '2026-10-09', dayNumber: 0 });
  });
});
