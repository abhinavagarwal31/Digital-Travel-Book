import { describe, expect, it } from 'vitest';
import { chunkSizes, composeBook, type ComposablePhoto } from './compose.ts';

const BOOK = { startDate: '2026-10-10', days: [], chapters: [] };

let nextId = 0;
function photo(
  dayDate: string | null,
  time: string | null,
  extra: Partial<ComposablePhoto> = {},
): ComposablePhoto {
  const local = time && dayDate ? `${dayDate}T${time}` : null;
  return {
    id: `p${String(nextId++).padStart(3, '0')}`,
    status: 'ready',
    hidden: false,
    dayDate,
    localDateTime: local,
    capturedAt: local ? `${local}.000Z` : null,
    gps: null,
    gpsStatus: null,
    assignedBy: 'auto',
    flags: [],
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

describe('composeBook with chapters and maps', () => {
  const at = (lat: number, lng: number) => ({ gps: { lat, lng }, gpsStatus: 'exif' as const });
  const TOKYO = { lat: 35.68, lng: 139.76 };
  const KYOTO = { lat: 35.01, lng: 135.77 };

  function trip() {
    const photos = [
      photo('2026-10-10', '09:00:00', at(TOKYO.lat, TOKYO.lng)),
      photo('2026-10-10', '15:00:00', at(35.71, 139.79)),
      photo('2026-10-11', '10:00:00'), // no location: in the book, not on the map
      photo('2026-10-12', '11:00:00', at(KYOTO.lat, KYOTO.lng)),
    ];
    const book = {
      ...BOOK,
      chapters: [
        { id: 'tokyo', title: 'Tokyo', dayDates: ['2026-10-10', '2026-10-11'] },
        { id: 'kyoto', title: 'Kyoto', dayDates: ['2026-10-12'] },
      ],
    };
    return { photos, book };
  }

  it('opens with a trip map, then each chapter opens with its own map before its days', () => {
    const { photos, book } = trip();
    const pages = composeBook(book, photos);
    expect(pages.map((p) => (p.kind === 'day' ? `day ${p.dayDate}` : p.kind))).toEqual([
      'cover',
      'endpaper',
      'title',
      'trip-map',
      'chapter',
      'day 2026-10-10',
      'photos',
      'day 2026-10-11',
      'chapter',
      'day 2026-10-12',
      'closing',
      'back-cover',
    ]);
    expect(pages[3]).toMatchObject({
      kind: 'trip-map',
      chapters: [
        { number: 1, title: 'Tokyo', firstDay: '2026-10-10', lastDay: '2026-10-11' },
        { number: 2, title: 'Kyoto', firstDay: '2026-10-12', lastDay: '2026-10-12' },
      ],
    });
    const tokyo = pages[4];
    expect(tokyo).toMatchObject({
      kind: 'chapter',
      chapterId: 'tokyo',
      number: 1,
      dayCount: 2,
      photoCount: 3,
    });
    if (tokyo?.kind !== 'chapter') throw new Error('expected a chapter opener');
    expect(tokyo.map?.pins.map((p) => p.number)).toEqual([1, 2]);
    expect(tokyo.map?.segments).toHaveLength(1);
    expect(pages[8]).toMatchObject({
      kind: 'chapter',
      map: { pins: [{ point: KYOTO }], segments: [] },
    });
  });

  it('leaves suspicious locations off the maps until confirmed, and removed ones always', () => {
    const { photos, book } = trip();
    const stray = photo('2026-10-12', '12:00:00', { ...at(0, 0), flags: ['gps_outlier'] });
    const removed = photo('2026-10-12', '13:00:00', { ...at(10, 10), gpsStatus: 'removed' });
    const chapterPins = (all: ComposablePhoto[]) =>
      composeBook(book, all).flatMap((p) =>
        p.kind === 'chapter' ? [p.map?.pins.length ?? 0] : [],
      );

    expect(chapterPins([...photos, stray, removed])).toEqual([2, 1]);
    expect(chapterPins([...photos, { ...stray, gpsStatus: 'confirmed' }, removed])).toEqual([2, 2]);
  });

  it('gives a chapter without located photos no map, and the trip map needs two chapters on it', () => {
    const { photos, book } = trip();
    const noKyotoGps = photos.map((p) =>
      p.dayDate === '2026-10-12' ? { ...p, gps: null, gpsStatus: null } : p,
    );
    const pages = composeBook(book, noKyotoGps);
    expect(pages.some((p) => p.kind === 'trip-map')).toBe(false);
    expect(pages.filter((p) => p.kind === 'chapter').map((p) => p.map === null)).toEqual([
      false,
      true,
    ]);
  });

  it('places a day no chapter names next to its neighbours, so no photo drops out', () => {
    const { photos, book } = trip();
    const pages = composeBook(book, [...photos, photo('2026-10-13', '09:00:00')]);
    const kinds = pages.flatMap((p) =>
      p.kind === 'blank' ? [] : [p.kind === 'day' ? p.dayDate : p.kind],
    );
    expect(kinds.slice(-4)).toEqual(['2026-10-12', '2026-10-13', 'closing', 'back-cover']);
    expect(pages.findLast((p) => p.kind === 'chapter')).toMatchObject({ dayCount: 2 });
  });

  it('skips chapters with nothing to show yet and numbers the rest in order', () => {
    const { photos, book } = trip();
    const withEmpty = {
      ...book,
      chapters: [{ id: 'empty', title: 'Later', dayDates: ['2026-10-09'] }, ...book.chapters],
    };
    const pages = composeBook(withEmpty, photos);
    expect(
      pages.flatMap((p) => (p.kind === 'chapter' ? [`${p.number} ${p.chapterId}`] : [])),
    ).toEqual(['1 tokyo', '2 kyoto']);
  });
});
