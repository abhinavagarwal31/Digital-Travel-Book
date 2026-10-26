import { describe, expect, it } from 'vitest';
import {
  dayDateOf,
  isOutsideTrip,
  isValidGps,
  parseOffset,
  resolveCaptureTime,
  zonedWallClockToUtc,
  type TimeContext,
} from './time.ts';

const KYOTO = { lat: 35.0116, lng: 135.7681 };
const LONDON = { lat: 51.5072, lng: -0.1276 };

// A stand-in for geo-tz: two known places, nowhere else.
const context: TimeContext = {
  defaultTz: 'Asia/Tokyo',
  zoneAt: (lat) => (lat > 40 ? 'Europe/London' : 'Asia/Tokyo'),
};

describe('resolveCaptureTime: order of trust', () => {
  it('1. uses an explicit EXIF offset', () => {
    expect(
      resolveCaptureTime(
        { localDateTime: '2026-10-12T17:42:10', offset: '+09:00', ...LONDON },
        context,
      ),
    ).toEqual({
      capturedAt: '2026-10-12T08:42:10.000Z',
      localDateTime: '2026-10-12T17:42:10',
      timeSource: 'exif-offset',
      tzAssumed: false,
    });
  });

  it('2. pairs the camera clock with GPS UTC time when they agree on a quarter hour', () => {
    const r = resolveCaptureTime(
      // Nepal is UTC+05:45: a quarter-hour offset.
      { localDateTime: '2026-10-12T17:42:10', gpsDateTimeUtc: '2026-10-12T11:57:25Z' },
      context,
    );
    expect(r.timeSource).toBe('gps-pair');
    expect(r.capturedAt).toBe('2026-10-12T11:57:10.000Z');
  });

  it('2. ignores a stale GPS fix that does not line up with a quarter hour', () => {
    const r = resolveCaptureTime(
      {
        localDateTime: '2026-10-12T17:42:10',
        gpsDateTimeUtc: '2026-10-12T08:35:00Z', // fix taken 7 min earlier
        ...KYOTO,
      },
      context,
    );
    expect(r.timeSource).toBe('gps-zone');
  });

  it('2. never uses GPS UTC time alone as an offset', () => {
    const r = resolveCaptureTime({ localDateTime: '2026-10-12T17:42:10' }, context);
    expect(r.timeSource).toBe('book-default');
  });

  it('3. uses the zone at the GPS position', () => {
    const r = resolveCaptureTime({ localDateTime: '2026-07-01T12:00:00', ...LONDON }, context);
    expect(r).toEqual({
      capturedAt: '2026-07-01T11:00:00.000Z', // BST, UTC+1
      localDateTime: '2026-07-01T12:00:00',
      timeSource: 'gps-zone',
      tzAssumed: false,
    });
  });

  it('4. falls back to the book zone and says so', () => {
    const r = resolveCaptureTime({ localDateTime: '2026-10-12T17:42:10' }, context);
    expect(r).toEqual({
      capturedAt: '2026-10-12T08:42:10.000Z',
      localDateTime: '2026-10-12T17:42:10',
      timeSource: 'book-default',
      tzAssumed: true,
    });
  });

  it('skips a malformed or out-of-range EXIF offset', () => {
    for (const offset of ['+9:00', '0900', '+15:00', '-13:00', 'Z']) {
      expect(
        resolveCaptureTime({ localDateTime: '2026-10-12T17:42:10', offset }, context),
      ).toMatchObject({ timeSource: 'book-default' });
    }
  });
});

describe('resolveCaptureTime: missing data', () => {
  it('derives an exact local time from GPS UTC time and position when the clock is missing', () => {
    expect(
      resolveCaptureTime({ gpsDateTimeUtc: '2026-10-12T15:30:00Z', ...KYOTO }, context),
    ).toEqual({
      capturedAt: '2026-10-12T15:30:00.000Z',
      localDateTime: '2026-10-13T00:30:00', // past midnight in Kyoto
      timeSource: 'gps-zone',
      tzAssumed: false,
    });
  });

  it('invents nothing without a clock or a GPS time', () => {
    const none = { capturedAt: null, localDateTime: null, timeSource: null, tzAssumed: false };
    expect(resolveCaptureTime({}, context)).toEqual(none);
    expect(resolveCaptureTime({ ...KYOTO }, context)).toEqual(none);
    expect(resolveCaptureTime({ gpsDateTimeUtc: '2026-10-12T15:30:00Z' }, context)).toEqual(none);
  });

  it.each(['0000-00-00T00:00:00', '2026-02-30T10:00:00', '2026-10-12T24:00:00', '2026-10-12'])(
    'treats the unusable camera clock %j as missing',
    (localDateTime) => {
      expect(resolveCaptureTime({ localDateTime }, context).localDateTime).toBeNull();
    },
  );

  it('ignores (0, 0) and out-of-range coordinates', () => {
    const r = resolveCaptureTime({ localDateTime: '2026-07-01T12:00:00', lat: 0, lng: 0 }, context);
    expect(r.timeSource).toBe('book-default');
  });

  it('keeps the wall clock, and therefore the day, when even the book zone is unusable', () => {
    const r = resolveCaptureTime(
      { localDateTime: '2026-10-12T17:42:10' },
      { defaultTz: 'Not/AZone', zoneAt: () => null },
    );
    expect(r).toEqual({
      capturedAt: null,
      localDateTime: '2026-10-12T17:42:10',
      timeSource: null,
      tzAssumed: true,
    });
  });
});

describe('zonedWallClockToUtc at daylight-saving changes (London)', () => {
  it('takes the earlier moment in the repeated hour and flags it', () => {
    // 2026-10-25 01:30 happens twice in London (BST, then GMT).
    expect(zonedWallClockToUtc('2026-10-25T01:30:00', 'Europe/London')).toEqual({
      ms: Date.parse('2026-10-25T00:30:00Z'),
      ambiguous: true,
    });
  });

  it('uses the pre-change offset for a time that never happened, and flags it', () => {
    // 2026-03-29 01:30 does not exist in London (clocks jump 01:00 → 02:00).
    expect(zonedWallClockToUtc('2026-03-29T01:30:00', 'Europe/London')).toEqual({
      ms: Date.parse('2026-03-29T01:30:00Z'),
      ambiguous: true,
    });
  });

  it('is exact on an ordinary day', () => {
    expect(zonedWallClockToUtc('2026-03-30T01:30:00', 'Europe/London')).toEqual({
      ms: Date.parse('2026-03-30T00:30:00Z'),
      ambiguous: false,
    });
  });

  it('marks the photo tzAssumed when the GPS zone is at a DST edge', () => {
    const r = resolveCaptureTime({ localDateTime: '2026-10-25T01:30:00', ...LONDON }, context);
    expect(r).toMatchObject({ timeSource: 'gps-zone', tzAssumed: true });
  });

  it('returns null for an unknown zone', () => {
    expect(zonedWallClockToUtc('2026-10-12T10:00:00', 'Mars/Olympus')).toBeNull();
  });
});

describe('days', () => {
  it('uses the local wall-clock date with a midnight boundary', () => {
    expect(dayDateOf('2026-10-12T23:59:59')).toBe('2026-10-12');
    expect(dayDateOf('2026-10-13T00:00:00')).toBe('2026-10-13');
    expect(dayDateOf(null)).toBeNull();
  });

  it('does not let the time zone move a photo to another day', () => {
    // 23:50 in Kyoto is 14:50 UTC the same day; 00:10 is 15:10 UTC the *previous* UTC day.
    const late = resolveCaptureTime({ localDateTime: '2026-10-12T23:50:00', ...KYOTO }, context);
    const early = resolveCaptureTime({ localDateTime: '2026-10-13T00:10:00', ...KYOTO }, context);
    expect(dayDateOf(late.localDateTime)).toBe('2026-10-12');
    expect(dayDateOf(early.localDateTime)).toBe('2026-10-13');
    expect(early.capturedAt?.slice(0, 10)).toBe('2026-10-12');
  });

  it('flags days more than one day outside the trip', () => {
    const trip = ['2026-10-10', '2026-10-15'] as const;
    expect(isOutsideTrip('2026-10-09', ...trip)).toBe(false);
    expect(isOutsideTrip('2026-10-16', ...trip)).toBe(false);
    expect(isOutsideTrip('2026-10-08', ...trip)).toBe(true);
    expect(isOutsideTrip('2026-10-17', ...trip)).toBe(true);
    expect(isOutsideTrip('2026-11-01', '2026-10-30', '2026-10-31')).toBe(false);
  });
});

describe('helpers', () => {
  it('parses offsets within UTC−12…UTC+14', () => {
    expect(parseOffset('+05:45')).toBe(345);
    expect(parseOffset('-03:30')).toBe(-210);
    expect(parseOffset('+14:00')).toBe(840);
    expect(parseOffset('+14:15')).toBeNull();
    expect(parseOffset(undefined)).toBeNull();
  });

  it('accepts only real coordinates', () => {
    expect(isValidGps(KYOTO.lat, KYOTO.lng)).toBe(true);
    expect(isValidGps(0, 0)).toBe(false);
    expect(isValidGps(91, 10)).toBe(false);
    expect(isValidGps(10, NaN)).toBe(false);
    expect(isValidGps(undefined, 10)).toBe(false);
  });
});
