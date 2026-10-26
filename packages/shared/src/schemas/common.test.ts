import { describe, expect, it } from 'vitest';
import {
  apiErrorSchema,
  isoDateSchema,
  isValidIsoDate,
  isValidTimeZone,
  objectIdSchema,
  timeZoneSchema,
} from './common.ts';

describe('objectIdSchema', () => {
  it('accepts 24 hex characters', () => {
    expect(objectIdSchema.safeParse('64b7f0c2a1d3e4f5a6b7c8d9').success).toBe(true);
  });

  it.each(['', '123', '64b7f0c2a1d3e4f5a6b7c8dz', '64b7f0c2a1d3e4f5a6b7c8d9a'])(
    'rejects %j',
    (value) => {
      expect(objectIdSchema.safeParse(value).success).toBe(false);
    },
  );
});

describe('isValidIsoDate', () => {
  it.each(['2026-10-12', '2024-02-29', '2026-12-31', '2026-01-01'])('accepts %s', (value) => {
    expect(isValidIsoDate(value)).toBe(true);
  });

  it.each([
    '2026-02-29', // not a leap year
    '2026-02-30',
    '2026-13-01',
    '2026-00-10',
    '2026-10-32',
    '2026-1-5',
    '2026-10-12T10:00:00',
    '12-10-2026',
    '',
  ])('rejects %s', (value) => {
    expect(isValidIsoDate(value)).toBe(false);
  });

  it('is used by isoDateSchema', () => {
    expect(isoDateSchema.safeParse('2026-10-12').success).toBe(true);
    expect(isoDateSchema.safeParse('2026-02-30').success).toBe(false);
  });
});

describe('isValidTimeZone', () => {
  it.each(['UTC', 'Asia/Tokyo', 'Asia/Kolkata', 'America/Argentina/Buenos_Aires', 'Etc/GMT+5'])(
    'accepts %s',
    (value) => {
      expect(isValidTimeZone(value)).toBe(true);
    },
  );

  it.each(['+05:30', '-08:00', 'Mars/Olympus_Mons', 'Asia/', 'Asia//Tokyo', '', 'asia tokyo'])(
    'rejects %j',
    (value) => {
      expect(isValidTimeZone(value)).toBe(false);
    },
  );

  it('is used by timeZoneSchema', () => {
    expect(timeZoneSchema.safeParse('Asia/Tokyo').success).toBe(true);
    expect(timeZoneSchema.safeParse('+05:30').success).toBe(false);
  });
});

describe('apiErrorSchema', () => {
  it('accepts an error with and without details', () => {
    expect(
      apiErrorSchema.safeParse({ error: { code: 'NOT_FOUND', message: 'Book not found' } }).success,
    ).toBe(true);
    expect(
      apiErrorSchema.safeParse({
        error: { code: 'VALIDATION_FAILED', message: 'Invalid body', details: [{ path: 'title' }] },
      }).success,
    ).toBe(true);
  });

  it('rejects a response without the error envelope', () => {
    expect(apiErrorSchema.safeParse({ code: 'NOT_FOUND', message: 'x' }).success).toBe(false);
  });
});
