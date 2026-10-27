import { describe, expect, it } from 'vitest';
import { distanceKm } from './geo.ts';
import { organize, type OrganizeBook } from './organize.ts';
import { detectOutliers, type TimedPoint } from './outliers.ts';
import { sortingStatus, sortingSummary } from './sorting.ts';
import { computeStops } from './stops.ts';
import { contentDays, daySet, proposeChapters, resolveChapters } from './structure.ts';
import { DEFAULT_ORGANIZE_CONFIG as CONFIG, type OrganizablePhoto } from './types.ts';

const TOKYO = { lat: 35.6595, lng: 139.7005 };
const TOKYO_TOWER = { lat: 35.6586, lng: 139.7454 }; // ~4 km from TOKYO
const KYOTO = { lat: 35.0116, lng: 135.7681 };
const KYOTO_NEARBY = { lat: 35.0121, lng: 135.7689 }; // ~90 m away
const OSAKA = { lat: 34.6687, lng: 135.5013 };
const PARIS = { lat: 48.8566, lng: 2.3522 };

let seq = 0;
/** A ready photo taken in Japan (UTC+9) at a local time, optionally located. */
function photo(
  local: string | null,
  gps: typeof TOKYO | null,
  extra: Partial<OrganizablePhoto> = {},
) {
  const id = `p${String(seq++).padStart(3, '0')}`;
  const capturedAt = local ? new Date(Date.parse(`${local}+09:00`)).toISOString() : null;
  return {
    id,
    status: 'ready',
    hidden: false,
    capturedAt,
    localDateTime: local,
    gps,
    gpsStatus: gps ? 'exif' : null,
    dayDate: local ? local.slice(0, 10) : null,
    assignedBy: 'auto',
    flags: local ? [] : ['no_time'],
    ...extra,
  } as OrganizablePhoto;
}

const BOOK: OrganizeBook = {
  startDate: '2026-10-10',
  endDate: '2026-10-15',
  diaryDates: [],
  chapters: [],
  chaptersEdited: false,
};

const point = (id: string, iso: string, p: typeof TOKYO, confirmed = false): TimedPoint => ({
  id,
  ms: Date.parse(iso),
  point: p,
  confirmed,
});

describe('distanceKm', () => {
  it('measures real distances', () => {
    expect(distanceKm(TOKYO, KYOTO)).toBeGreaterThan(360);
    expect(distanceKm(TOKYO, KYOTO)).toBeLessThan(375);
    expect(distanceKm(KYOTO, KYOTO_NEARBY) * 1000).toBeLessThan(120);
  });
});

describe('detectOutliers', () => {
  it('flags a single stray fix in the middle of a walk', () => {
    const flagged = detectOutliers(
      [
        point('a', '2026-10-12T01:00:00Z', KYOTO),
        point('stray', '2026-10-12T01:10:00Z', PARIS),
        point('c', '2026-10-12T01:20:00Z', KYOTO_NEARBY),
      ],
      CONFIG,
    );
    expect([...flagged]).toEqual(['stray']);
  });

  it('does not flag a real flight that later photos agree with', () => {
    const flagged = detectOutliers(
      [
        point('tokyo', '2026-10-15T00:00:00Z', TOKYO),
        point('paris1', '2026-10-15T13:00:00Z', PARIS), // 13 h later: ~750 km/h
        point('paris2', '2026-10-15T14:00:00Z', PARIS),
      ],
      CONFIG,
    );
    expect(flagged.size).toBe(0);
  });

  it('flags a stray fix at the start and at the end of the trip', () => {
    const flagged = detectOutliers(
      [
        point('first', '2026-10-12T00:00:00Z', PARIS),
        point('b', '2026-10-12T00:20:00Z', KYOTO),
        point('c', '2026-10-12T00:40:00Z', KYOTO_NEARBY),
        point('d', '2026-10-12T01:00:00Z', KYOTO),
        point('last', '2026-10-12T01:20:00Z', PARIS),
      ],
      CONFIG,
    );
    expect([...flagged].sort()).toEqual(['first', 'last']);
  });

  it('ignores jitter: big implied speed over a tiny distance', () => {
    const flagged = detectOutliers(
      [
        point('a', '2026-10-12T01:00:00Z', KYOTO),
        point('b', '2026-10-12T01:00:05Z', { lat: 35.05, lng: 135.77 }), // 4 km in 5 s
        point('c', '2026-10-12T01:00:10Z', KYOTO),
      ],
      CONFIG,
    );
    expect(flagged.size).toBe(0);
  });

  it('does not single out a point when its neighbours disagree with each other too', () => {
    // Three far-apart fixes minutes apart: something is wrong, but nothing says which.
    const flagged = detectOutliers(
      [
        point('a', '2026-10-12T01:00:00Z', KYOTO),
        point('b', '2026-10-12T01:10:00Z', PARIS),
        point('c', '2026-10-12T01:20:00Z', { lat: 40.7128, lng: -74.006 }),
      ],
      CONFIG,
    );
    expect(flagged.size).toBe(0);
  });

  it('never flags a location the user confirmed', () => {
    const flagged = detectOutliers(
      [
        point('a', '2026-10-12T01:00:00Z', KYOTO),
        point('stray', '2026-10-12T01:10:00Z', PARIS, true),
        point('c', '2026-10-12T01:20:00Z', KYOTO),
      ],
      CONFIG,
    );
    expect(flagged.size).toBe(0);
  });

  it('needs enough neighbours to judge', () => {
    expect(detectOutliers([point('a', '2026-10-12T01:00:00Z', KYOTO)], CONFIG).size).toBe(0);
    expect(
      detectOutliers(
        [point('a', '2026-10-12T01:00:00Z', KYOTO), point('b', '2026-10-12T01:05:00Z', PARIS)],
        CONFIG,
      ).size,
    ).toBe(0);
  });
});

describe('computeStops', () => {
  it('groups nearby photos taken close in time, in time order', () => {
    const a = photo('2026-10-12T08:00:00', KYOTO);
    const b = photo('2026-10-12T08:30:00', KYOTO_NEARBY);
    const c = photo('2026-10-12T15:00:00', OSAKA);
    const stops = computeStops([c, b, a], new Set(), CONFIG);
    expect(stops.map((s) => s.locatedPhotoIds)).toEqual([[a.id, b.id], [c.id]]);
    expect(stops[0]?.id).toBe(a.id);
  });

  it('treats a return visit later as a new stop', () => {
    const morning = photo('2026-10-12T08:00:00', KYOTO);
    const lunch = photo('2026-10-12T12:00:00', OSAKA);
    const evening = photo('2026-10-12T19:00:00', KYOTO_NEARBY);
    const stops = computeStops([morning, lunch, evening], new Set(), CONFIG);
    expect(stops).toHaveLength(3);
  });

  it('starts a new stop after a long gap even in the same place', () => {
    const a = photo('2026-10-12T08:00:00', KYOTO);
    const b = photo('2026-10-12T11:00:00', KYOTO_NEARBY); // 3 h later
    expect(computeStops([a, b], new Set(), CONFIG)).toHaveLength(2);
  });

  it('makes timed photos without GPS members of the visit they fall in, never giving them coordinates', () => {
    const a = photo('2026-10-12T08:00:00', KYOTO);
    const noGps = photo('2026-10-12T08:20:00', null);
    const b = photo('2026-10-12T08:40:00', KYOTO_NEARBY);
    const later = photo('2026-10-12T20:00:00', null); // outside any visit
    const stops = computeStops([a, noGps, b, later], new Set(), CONFIG);
    expect(stops).toHaveLength(1);
    expect(stops[0]?.unlocatedPhotoIds).toEqual([noGps.id]);
    expect(stops[0]?.locatedPhotoIds).toEqual([a.id, b.id]);
    expect(noGps.gps).toBeNull();
  });

  it('leaves out outliers, removed locations, hidden and unfinished photos', () => {
    const good = photo('2026-10-12T08:00:00', KYOTO);
    const outlier = photo('2026-10-12T08:10:00', PARIS);
    const removed = photo('2026-10-12T08:20:00', OSAKA, { gpsStatus: 'removed' });
    const hidden = photo('2026-10-12T08:30:00', KYOTO, { hidden: true });
    const pending = photo('2026-10-12T08:40:00', KYOTO, { status: 'pending' });
    const stops = computeStops(
      [good, outlier, removed, hidden, pending],
      new Set([outlier.id]),
      CONFIG,
    );
    expect(stops.map((s) => s.locatedPhotoIds)).toEqual([[good.id]]);
    // Outlier and removed-location photos still count as visit members by time.
    expect(stops[0]?.unlocatedPhotoIds).toEqual([]);
  });

  it('pins a stop at the median, so one stray point cannot drag it', () => {
    const photos = [
      photo('2026-10-12T08:00:00', KYOTO),
      photo('2026-10-12T08:10:00', KYOTO),
      photo('2026-10-12T08:20:00', { lat: 35.0151, lng: 135.7681 }), // 390 m north
    ];
    const [stop] = computeStops(photos, new Set(), CONFIG);
    expect(stop?.point).toEqual(KYOTO);
  });
});

describe('days and chapters', () => {
  it('derives the day set from range, photos, diaries and chapters', () => {
    const days = daySet(
      {
        startDate: '2026-10-10',
        endDate: '2026-10-11',
        diaryDates: ['2026-10-20'],
        chapters: [{ id: 'c', title: 'x', dayDates: ['2026-10-25'] }],
      },
      [photo('2026-10-09T22:00:00', null), photo('2026-10-11T10:00:00', null)],
    );
    expect(days).toEqual(['2026-10-09', '2026-10-10', '2026-10-11', '2026-10-20', '2026-10-25']);
  });

  it('counts only visible photos and diaries as content', () => {
    const days = contentDays(
      [photo('2026-10-10T10:00:00', null), photo('2026-10-11T10:00:00', null, { hidden: true })],
      ['2026-10-13'],
    );
    expect(days).toEqual(['2026-10-10', '2026-10-13']);
  });

  it('places a new day in the chapter holding the nearest earlier day', () => {
    const chapters = [
      { id: 'tokyo', title: 'Tokyo', dayDates: ['2026-10-10', '2026-10-11'] },
      { id: 'kyoto', title: 'Kyoto', dayDates: ['2026-10-13'] },
    ];
    const resolved = resolveChapters(chapters, ['2026-10-09', '2026-10-12', '2026-10-14']);
    expect(resolved).toEqual([
      {
        id: 'tokyo',
        title: 'Tokyo',
        dayDates: ['2026-10-09', '2026-10-10', '2026-10-11', '2026-10-12'],
      },
      { id: 'kyoto', title: 'Kyoto', dayDates: ['2026-10-13', '2026-10-14'] },
    ]);
    expect(chapters[0]?.dayDates).toEqual(['2026-10-10', '2026-10-11']); // input untouched
  });

  it('keeps chapter order even when the user reordered against the calendar', () => {
    const chapters = [
      { id: 'kyoto', title: 'Kyoto first', dayDates: ['2026-10-13'] },
      { id: 'tokyo', title: 'Then Tokyo', dayDates: ['2026-10-10'] },
    ];
    const resolved = resolveChapters(chapters, ['2026-10-11']);
    expect(resolved.map((c) => c.id)).toEqual(['kyoto', 'tokyo']);
    expect(resolved[1]?.dayDates).toEqual(['2026-10-10', '2026-10-11']);
  });

  it('suggests chapters by area, letting unlocated days join the previous one', () => {
    const chapters = proposeChapters(
      ['2026-10-10', '2026-10-11', '2026-10-12', '2026-10-13', '2026-10-14'],
      new Map([
        ['2026-10-10', TOKYO],
        ['2026-10-11', TOKYO_TOWER],
        // 12th: no located photos
        ['2026-10-13', KYOTO],
        ['2026-10-14', OSAKA],
      ]),
      CONFIG,
    );
    expect(chapters.map((c) => c.dayDates)).toEqual([
      ['2026-10-10', '2026-10-11', '2026-10-12'],
      ['2026-10-13'],
      ['2026-10-14'],
    ]);
    expect(chapters.map((c) => c.title)).toEqual([
      'Chapter 1 · 10 – 12 Oct',
      'Chapter 2 · 13 Oct',
      'Chapter 3 · 14 Oct',
    ]);
    expect(chapters[0]?.id).toBe('c-2026-10-10');
  });
});

describe('sortingStatus', () => {
  it.each([
    [
      'GPS and time',
      photo('2026-10-12T10:00:00', KYOTO),
      { inBook: true, toSort: false, toCheck: false, reasons: [] },
    ],
    [
      'time without GPS (location is optional)',
      photo('2026-10-12T10:00:00', null),
      { inBook: true, toSort: false, toCheck: false, reasons: [] },
    ],
    [
      'GPS without time',
      photo(null, KYOTO),
      { inBook: false, toSort: true, toCheck: false, reasons: ['no_date_but_location'] },
    ],
    [
      'neither',
      photo(null, null),
      { inBook: false, toSort: true, toCheck: false, reasons: ['no_date'] },
    ],
    [
      'outside the trip',
      photo(null, null, { flags: ['outside_trip'] }),
      { inBook: false, toSort: true, toCheck: false, reasons: ['outside_trip'] },
    ],
    [
      'left unsorted by the user',
      photo('2026-10-12T10:00:00', KYOTO, { dayDate: null, assignedBy: 'user' }),
      { inBook: false, toSort: true, toCheck: false, reasons: ['removed_by_you'] },
    ],
    [
      'a suspicious location on a dated photo',
      photo('2026-10-12T10:00:00', PARIS, { flags: ['gps_outlier'] }),
      { inBook: true, toSort: false, toCheck: true, reasons: ['location_check'] },
    ],
    [
      'a confirmed location',
      photo('2026-10-12T10:00:00', PARIS, { flags: ['gps_outlier'], gpsStatus: 'confirmed' }),
      { inBook: true, toSort: false, toCheck: false, reasons: [] },
    ],
    [
      'an excluded photo',
      photo(null, null, { hidden: true }),
      { inBook: false, toSort: false, toCheck: false, reasons: [] },
    ],
    [
      'an unfinished upload',
      photo(null, null, { status: 'pending' }),
      { inBook: false, toSort: false, toCheck: false, reasons: [] },
    ],
  ])('%s', (_label, p, expected) => {
    expect(sortingStatus(p)).toEqual(expected);
  });

  it('is complete only when nothing is left to sort or check', () => {
    expect(
      sortingSummary([photo('2026-10-12T10:00:00', null), photo(null, null, { hidden: true })]),
    ).toEqual({
      ready: 2,
      inBook: 1,
      toSort: 0,
      toCheck: 0,
      excluded: 1,
      complete: true,
    });
    expect(sortingSummary([photo(null, null)]).complete).toBe(false);
  });
});

describe('organize', () => {
  it('gives auto photos their own day and flags far-off clocks', () => {
    const inTrip = photo('2026-10-12T23:50:00', KYOTO);
    const afterMidnight = photo('2026-10-13T00:10:00', KYOTO);
    const wrongClock = photo('2025-01-01T00:05:00', null);
    const { photoChanges } = organize([inTrip, afterMidnight, wrongClock], BOOK);
    expect(photoChanges).toEqual([{ id: wrongClock.id, dayDate: null, flags: ['outside_trip'] }]);
  });

  it('never moves a photo the user placed or deliberately left unsorted', () => {
    const placed = photo('2026-10-12T10:00:00', KYOTO, {
      dayDate: '2026-10-14',
      assignedBy: 'user',
    });
    const unsorted = photo('2026-10-12T11:00:00', KYOTO, { dayDate: null, assignedBy: 'user' });
    const { photoChanges } = organize([placed, unsorted], BOOK);
    expect(photoChanges).toEqual([]);
  });

  it('follows the trip dates when they change, without touching user decisions', () => {
    const auto = photo('2026-10-14T10:00:00', OSAKA);
    const user = photo('2026-10-14T11:00:00', OSAKA, { assignedBy: 'user' });
    const shrunk = { ...BOOK, endDate: '2026-10-12' }; // the 14th is now 2 days outside
    const { photoChanges } = organize([auto, user], shrunk);
    expect(photoChanges).toEqual([
      { id: auto.id, dayDate: null, flags: ['outside_trip'] },
      { id: user.id, dayDate: '2026-10-14', flags: ['outside_trip'] },
    ]);

    // Extending the trip brings the auto photo back.
    const back = organize([{ ...auto, dayDate: null, flags: ['outside_trip'] }], BOOK);
    expect(back.photoChanges).toEqual([{ id: auto.id, dayDate: '2026-10-14', flags: [] }]);
  });

  it('flags outliers and keeps the flags set at upload', () => {
    const a = photo('2026-10-12T10:00:00', KYOTO, { flags: ['tz_assumed'] });
    const stray = photo('2026-10-12T10:10:00', PARIS);
    const c = photo('2026-10-12T10:20:00', KYOTO);
    const { photoChanges } = organize([a, stray, c], BOOK);
    expect(photoChanges).toEqual([{ id: stray.id, dayDate: '2026-10-12', flags: ['gps_outlier'] }]);
  });

  it('suggests chapters until the user edits them, then only places new days', () => {
    const photos = [
      photo('2026-10-10T10:00:00', TOKYO),
      photo('2026-10-12T10:00:00', KYOTO),
      photo('2026-10-14T10:00:00', OSAKA),
    ];
    const suggested = organize(photos, BOOK).chapters;
    expect(suggested.map((c) => c.dayDates)).toEqual([
      ['2026-10-10'],
      ['2026-10-12'],
      ['2026-10-14'],
    ]);

    const edited = organize(photos, {
      ...BOOK,
      chaptersEdited: true,
      chapters: [{ id: 'mine', title: 'My whole trip', dayDates: ['2026-10-10', '2026-10-12'] }],
    }).chapters;
    expect(edited).toEqual([
      { id: 'mine', title: 'My whole trip', dayDates: ['2026-10-10', '2026-10-12', '2026-10-14'] },
    ]);
  });

  it('includes diary-only days in chapters', () => {
    const { chapters } = organize([photo('2026-10-10T10:00:00', TOKYO)], {
      ...BOOK,
      diaryDates: ['2026-10-11'],
    });
    expect(chapters.flatMap((c) => c.dayDates)).toEqual(['2026-10-10', '2026-10-11']);
  });

  it('is deterministic', () => {
    const photos = [
      photo('2026-10-10T10:00:00', TOKYO),
      photo('2026-10-12T10:00:00', KYOTO),
      photo('2026-10-12T10:10:00', PARIS),
      photo('2026-10-12T10:20:00', KYOTO),
      photo(null, null),
    ];
    expect(organize([...photos].reverse(), BOOK)).toEqual(organize(photos, BOOK));
  });
});
