import { captureFields } from '@tb/shared';
import { describe, expect, it } from 'vitest';
import { timeZoneAt } from '../../lib/timeZoneAt.ts';
import { makeJpeg } from '../../test/makeJpeg.ts';
import { readExif, sniffImageType } from './metadata.ts';

const KYOTO = { lat: 35.0116, lng: 135.7681 };

describe('sniffImageType', () => {
  it('recognizes a real JPEG', () => {
    expect(sniffImageType(makeJpeg())).toBe('image/jpeg');
  });

  it.each([
    ['PNG', Buffer.from('89504e470d0a1a0a0000000d49484452', 'hex'), 'image/png'],
    ['WebP', Buffer.from('RIFF\x24\x00\x00\x00WEBPVP8 ', 'latin1'), 'image/webp'],
    ['HEIC', Buffer.from('\x00\x00\x00\x18ftypheic\x00\x00\x00\x00', 'latin1'), 'image/heic'],
    [
      'HEIF (mif1)',
      Buffer.from('\x00\x00\x00\x18ftypmif1\x00\x00\x00\x00', 'latin1'),
      'image/heic',
    ],
  ])('recognizes %s from its header', (_name, bytes, mime) => {
    expect(sniffImageType(bytes)).toBe(mime);
  });

  it.each([
    ['a text file renamed .jpg', Buffer.from('hello, I am not a photo')],
    ['an MP4 video', Buffer.from('\x00\x00\x00\x18ftypisom\x00\x00\x00\x00', 'latin1')],
    ['an empty file', Buffer.alloc(0)],
    ['a GIF', Buffer.from('GIF89a', 'latin1')],
  ])('rejects %s', (_name, bytes) => {
    expect(sniffImageType(bytes)).toBeNull();
  });
});

describe('readExif', () => {
  it('reads everything a phone records', async () => {
    const jpeg = makeJpeg({
      exif: {
        dateTimeOriginal: '2026:10:12 17:42:10',
        offsetTimeOriginal: '+09:00',
        gps: KYOTO,
        gpsDateTimeUtc: '2026-10-12T08:42:10Z',
        make: 'Apple',
        model: 'iPhone 15',
      },
    });
    const exif = await readExif(jpeg);
    expect(exif).toMatchObject({
      localDateTime: '2026-10-12T17:42:10',
      offset: '+09:00',
      gpsDateTimeUtc: '2026-10-12T08:42:10Z',
      make: 'Apple',
      model: 'iPhone 15',
    });
    expect(exif.lat).toBeCloseTo(KYOTO.lat, 5);
    expect(exif.lng).toBeCloseTo(KYOTO.lng, 5);
  });

  it('signs southern and western coordinates negative', async () => {
    const exif = await readExif(makeJpeg({ exif: { gps: { lat: -33.8568, lng: -70.6483 } } }));
    expect(exif.lat).toBeCloseTo(-33.8568, 5);
    expect(exif.lng).toBeCloseTo(-70.6483, 5);
  });

  it('returns nothing for a photo with stripped metadata', async () => {
    expect(await readExif(makeJpeg())).toEqual({});
  });

  it('falls back to the digitized time, never the edit time', async () => {
    const digitized = await readExif(
      makeJpeg({ exif: { createDate: '2026:10:12 09:00:00', modifyDate: '2026:12:01 20:00:00' } }),
    );
    expect(digitized.localDateTime).toBe('2026-10-12T09:00:00');

    const editedOnly = await readExif(makeJpeg({ exif: { modifyDate: '2026:12:01 20:00:00' } }));
    expect(editedOnly.localDateTime).toBeUndefined();
  });

  it('uses OffsetTime when OffsetTimeOriginal is missing', async () => {
    const exif = await readExif(
      makeJpeg({ exif: { dateTimeOriginal: '2026:10:12 17:42:10', offsetTime: '+05:30' } }),
    );
    expect(exif.offset).toBe('+05:30');
  });

  it('ignores a zeroed-out camera clock', async () => {
    const exif = await readExif(makeJpeg({ exif: { dateTimeOriginal: '0000:00:00 00:00:00' } }));
    expect(exif.localDateTime).toBe('0000-00-00T00:00:00'); // raw, as recorded…
    expect(captureFields(exif, TRIP, timeZoneAt).flags).toEqual(['no_time']); // …but unusable
  });

  it.each([
    ['random bytes', Buffer.from('definitely not an image at all')],
    [
      'a truncated JPEG',
      makeJpeg({ exif: { dateTimeOriginal: '2026:10:12 17:42:10' } }).subarray(0, 40),
    ],
    ['an empty buffer', Buffer.alloc(0)],
  ])('never throws on %s', async (_name, bytes) => {
    await expect(readExif(bytes)).resolves.toBeTypeOf('object');
  });
});

const TRIP = { startDate: '2026-10-10', endDate: '2026-10-15', defaultTz: 'Asia/Tokyo' };

describe('from file bytes to working fields (EXIF + geo-tz + resolution)', () => {
  it('dates a DSLR photo with GPS but no offset using the zone at its position', async () => {
    const exif = await readExif(
      makeJpeg({ exif: { dateTimeOriginal: '2026:10:13 00:10:00', gps: KYOTO, make: 'Canon' } }),
    );
    expect(captureFields(exif, TRIP, timeZoneAt)).toEqual({
      capturedAt: '2026-10-12T15:10:00.000Z',
      localDateTime: '2026-10-13T00:10:00',
      timeSource: 'gps-zone',
      gps: { lat: expect.closeTo(KYOTO.lat, 5), lng: expect.closeTo(KYOTO.lng, 5) },
      dayDate: '2026-10-13', // after midnight in Kyoto, even though UTC is still the 12th
      flags: [],
    });
  });

  it('resolves real zones for real places', () => {
    expect(timeZoneAt(KYOTO.lat, KYOTO.lng)).toBe('Asia/Tokyo');
    expect(timeZoneAt(51.5072, -0.1276)).toBe('Europe/London');
    expect(timeZoneAt(27.7172, 85.324)).toBe('Asia/Kathmandu');
  });
});
