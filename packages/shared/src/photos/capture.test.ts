import { describe, expect, it } from 'vitest';
import { captureFields, type TripContext } from './capture.ts';

const TRIP: TripContext = {
  startDate: '2026-10-10',
  endDate: '2026-10-15',
  defaultTz: 'Asia/Tokyo',
};
const zoneAt = () => 'Asia/Tokyo';
const KYOTO = { lat: 35.0116, lng: 135.7681 };

describe('captureFields', () => {
  it('fills every field for a phone photo with full metadata', () => {
    expect(
      captureFields(
        { localDateTime: '2026-10-12T17:42:10', offset: '+09:00', ...KYOTO },
        TRIP,
        zoneAt,
      ),
    ).toEqual({
      capturedAt: '2026-10-12T08:42:10.000Z',
      localDateTime: '2026-10-12T17:42:10',
      timeSource: 'exif-offset',
      gps: KYOTO,
      dayDate: '2026-10-12',
      flags: [],
    });
  });

  it('gives a camera photo without GPS a day, but flags the assumed zone', () => {
    const f = captureFields({ localDateTime: '2026-10-13T09:00:00' }, TRIP, zoneAt);
    expect(f).toMatchObject({ gps: null, dayDate: '2026-10-13', flags: ['tz_assumed'] });
  });

  it('flags a photo with no time and invents neither time nor day', () => {
    const f = captureFields({ ...KYOTO }, TRIP, zoneAt);
    expect(f).toEqual({
      capturedAt: null,
      localDateTime: null,
      timeSource: null,
      gps: KYOTO,
      dayDate: null,
      flags: ['no_time'],
    });
  });

  it('keeps the time of a photo far outside the trip but gives it no day', () => {
    const f = captureFields(
      { localDateTime: '2025-01-01T00:00:05', offset: '+09:00' },
      TRIP,
      zoneAt,
    );
    expect(f).toMatchObject({
      localDateTime: '2025-01-01T00:00:05',
      dayDate: null,
      flags: ['outside_trip'],
    });
  });

  it('gives a day to a photo one day either side of the trip', () => {
    const before = captureFields(
      { localDateTime: '2026-10-09T22:00:00', offset: '+09:00' },
      TRIP,
      zoneAt,
    );
    expect(before).toMatchObject({ dayDate: '2026-10-09', flags: [] });
  });

  it('drops invalid coordinates instead of storing them', () => {
    const f = captureFields({ localDateTime: '2026-10-12T10:00:00', lat: 0, lng: 0 }, TRIP, zoneAt);
    expect(f.gps).toBeNull();
  });
});
