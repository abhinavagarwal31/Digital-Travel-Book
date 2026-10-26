import { describe, expect, it } from 'vitest';
import {
  createBookBodySchema,
  MAX_TRIP_DAYS,
  tripLengthDays,
  tripRangeProblem,
  updateBookBodySchema,
} from './book.ts';

const valid = {
  title: 'Whispers of Japan',
  startDate: '2026-10-10',
  endDate: '2026-10-15',
  defaultTz: 'Asia/Tokyo',
  destinations: ['Tokyo', 'Kyoto'],
};

describe('trip range', () => {
  it('counts days inclusively, across month and DST boundaries', () => {
    expect(tripLengthDays('2026-10-10', '2026-10-10')).toBe(1);
    expect(tripLengthDays('2026-10-10', '2026-10-15')).toBe(6);
    expect(tripLengthDays('2026-10-30', '2026-11-02')).toBe(4);
    expect(tripLengthDays('2026-03-28', '2026-03-30')).toBe(3);
  });

  it('allows a one-day trip and the maximum span', () => {
    expect(tripRangeProblem('2026-10-10', '2026-10-10')).toBeNull();
    expect(tripRangeProblem('2026-01-01', '2026-12-31')).toBeNull(); // 365 days
    expect(tripRangeProblem('2028-01-01', '2028-12-31')).toBeNull(); // 366, leap year
  });

  it('rejects an end before the start and an over-long trip', () => {
    expect(tripRangeProblem('2026-10-15', '2026-10-10')).toMatch(/on or after/);
    expect(tripRangeProblem('2026-01-01', '2027-01-02')).toMatch(`${MAX_TRIP_DAYS}`);
  });
});

describe('createBookBodySchema', () => {
  it('accepts a valid book, trimming text and defaulting destinations', () => {
    const withoutDestinations = {
      title: '  Japan  ',
      startDate: valid.startDate,
      endDate: valid.endDate,
      defaultTz: valid.defaultTz,
    };
    expect(createBookBodySchema.parse(withoutDestinations)).toEqual({
      title: 'Japan',
      startDate: '2026-10-10',
      endDate: '2026-10-15',
      defaultTz: 'Asia/Tokyo',
      destinations: [],
    });
  });

  it.each([
    ['a missing end date', { endDate: undefined }],
    ['an end before the start', { endDate: '2026-10-01' }],
    ['an impossible date', { startDate: '2026-02-30' }],
    ['a non-IANA time zone', { defaultTz: '+09:00' }],
    ['a blank title', { title: '  ' }],
    ['a blank destination', { destinations: ['Tokyo', ' '] }],
  ])('rejects %s', (_label, change) => {
    expect(createBookBodySchema.safeParse({ ...valid, ...change }).success).toBe(false);
  });

  it.each(['userId', 'state', 'theme', '_id'])('rejects the server-owned field %s', (key) => {
    expect(createBookBodySchema.safeParse({ ...valid, [key]: 'x' }).success).toBe(false);
  });
});

describe('updateBookBodySchema', () => {
  it('accepts any subset of the editable fields', () => {
    expect(updateBookBodySchema.parse({ title: 'New title' })).toEqual({ title: 'New title' });
    expect(updateBookBodySchema.parse({ description: '' })).toEqual({ description: '' });
  });

  it('rejects an empty update and unknown fields', () => {
    expect(updateBookBodySchema.safeParse({}).success).toBe(false);
    expect(updateBookBodySchema.safeParse({ userId: 'x' }).success).toBe(false);
  });
});
