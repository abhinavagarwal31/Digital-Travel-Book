import { describe, expect, it } from 'vitest';
import { atlasV1 } from '../themes/atlas.v1.ts';
import type { ThemeDefinition } from '../themes/definition.ts';
import { scrapbookV1 } from '../themes/scrapbook.v1.ts';
import {
  chunkSizes,
  composeBook as composeWith,
  type ComposableBook,
  type ComposablePhoto,
} from './compose.ts';
import { DIARY_BUDGET } from './paginate.ts';

// Atlas allows four photos a page, which most cases below assume.
const composeBook = (
  book: ComposableBook,
  photos: ComposablePhoto[],
  theme: ThemeDefinition = atlasV1,
) => composeWith(book, photos, theme);

const BOOK: ComposableBook = { startDate: '2026-10-10', days: [], chapters: [] };

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
    caption: '',
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

describe('chunkSizes with fewer photos a page', () => {
  it.each([
    [3, 4, [2, 2]],
    [3, 7, [3, 2, 2]],
    [2, 3, [2, 1]],
    [1, 3, [1, 1, 1]],
  ])('with %i a page, splits %i photos as %j', (max, count, sizes) => {
    expect(chunkSizes(count, max)).toEqual(sizes);
  });
});

describe('composeBook', () => {
  it('lets the theme decide how many photos share a page', () => {
    const photos = Array.from({ length: 5 }, (_, i) => photo('2026-10-10', `0${i}:00:00`));
    const sizes = (theme: ThemeDefinition) =>
      composeBook(BOOK, photos, theme).flatMap((p) =>
        p.kind === 'photos' ? [p.photoIds.length] : [],
      );
    expect(sizes(atlasV1)).toEqual([4]);
    expect(sizes(scrapbookV1)).toEqual([2, 2]);
  });

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
        heroCaption: '',
        photoCount: 1,
        timeRange: ['10:15', '10:15'],
      },
      {
        kind: 'day',
        dayDate: '2026-10-12',
        dayNumber: 3,
        heroPhotoId: early.id,
        heroCaption: '',
        photoCount: 3,
        timeRange: ['08:05', '18:30'],
      },
      { kind: 'photos', dayDate: '2026-10-12', photoIds: [mid.id, late.id], captions: {} },
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
    expect(pages[4]).toEqual({
      kind: 'photos',
      dayDate: '2026-10-11',
      photoIds: [untimed.id],
      captions: {},
    });
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

describe('composeBook with diaries and captions', () => {
  const diary = (date: string, text: string) => ({ date, diary: text });

  it('puts the diary after the day opener and before the rest of the photos', () => {
    const a = photo('2026-10-10', '09:00:00');
    const b = photo('2026-10-10', '10:00:00');
    const pages = composeBook({ ...BOOK, days: [diary('2026-10-10', 'Arrived.\n\nRamen.')] }, [
      a,
      b,
    ]);
    expect(pages.slice(3, 6)).toEqual([
      expect.objectContaining({ kind: 'day', heroPhotoId: a.id }),
      {
        kind: 'diary',
        dayDate: '2026-10-10',
        dayNumber: 1,
        paragraphs: ['Arrived.', 'Ramen.'],
        continued: false,
        opensDay: false,
      },
      expect.objectContaining({ kind: 'photos', photoIds: [b.id] }),
    ]);
  });

  it('gives a day with only a diary entry its own pages, opened by the diary', () => {
    const pages = composeBook(
      { ...BOOK, days: [diary('2026-10-11', 'A rest day, no photos at all.')] },
      [photo('2026-10-10', '09:00:00')],
    );
    expect(pages.map((p) => (p.kind === 'diary' ? `diary ${p.opensDay}` : p.kind))).toEqual([
      'cover',
      'endpaper',
      'title',
      'day',
      'diary true',
      'closing',
      'blank',
      'back-cover',
    ]);
    expect(pages.at(-3)).toEqual({ kind: 'closing', dayCount: 2, photoCount: 1 });
  });

  it('continues a long diary over as many pages as it needs', () => {
    const long = Array.from({ length: 120 }, () => 'The train hummed through rice fields.').join(
      ' ',
    );
    const pages = composeBook({ ...BOOK, days: [diary('2026-10-10', long)] }, [
      photo('2026-10-10', '09:00:00'),
    ]);
    const diaryPages = pages.filter((p) => p.kind === 'diary');
    expect(diaryPages.length).toBeGreaterThan(2);
    expect(diaryPages.map((p) => p.continued)).toEqual([
      false,
      ...Array(diaryPages.length - 1).fill(true),
    ]);
    expect(diaryPages.every((p) => !p.opensDay)).toBe(true);
  });

  it('gives a full page to the first diary page unless it also carries the day heading', () => {
    // Exactly one full page of lines, each line a single word that fills it.
    const word = 'x'.repeat(DIARY_BUDGET.charsPerLine);
    const onePage = Array.from({ length: DIARY_BUDGET.linesPerPage }, () => word).join(' ');
    const count = (photos: ComposablePhoto[]) =>
      composeBook({ ...BOOK, days: [diary('2026-10-10', onePage)] }, photos).filter(
        (p) => p.kind === 'diary',
      ).length;
    expect(count([photo('2026-10-10', '09:00:00')])).toBe(1);
    expect(count([])).toBe(2);
  });

  it('ignores an empty or blank diary entry', () => {
    const pages = composeBook({ ...BOOK, days: [diary('2026-10-12', '  \n ')] }, []);
    expect(pages.some((p) => p.kind === 'diary')).toBe(false);
    expect(pages).toContainEqual({ kind: 'closing', dayCount: 0, photoCount: 0 });
  });

  it("carries each photo's caption onto its page, and the hero's onto the opener", () => {
    const hero = photo('2026-10-10', '09:00:00', { caption: 'First light' });
    const plain = photo('2026-10-10', '10:00:00');
    const named = photo('2026-10-10', '11:00:00', { caption: 'Shibuya crossing' });
    const pages = composeBook(BOOK, [hero, plain, named]);
    expect(pages[3]).toMatchObject({ kind: 'day', heroCaption: 'First light' });
    expect(pages[4]).toMatchObject({
      kind: 'photos',
      photoIds: [plain.id, named.id],
      captions: { [named.id]: 'Shibuya crossing' },
    });
  });

  it('puts a diary-only day in its chapter', () => {
    const pages = composeBook(
      {
        ...BOOK,
        days: [diary('2026-10-11', 'Rain all day.')],
        chapters: [{ id: 'c1', title: 'Tokyo', dayDates: ['2026-10-10'] }],
      },
      [photo('2026-10-10', '09:00:00')],
    );
    expect(pages.find((p) => p.kind === 'chapter')).toMatchObject({ dayCount: 2, photoCount: 1 });
  });
});
