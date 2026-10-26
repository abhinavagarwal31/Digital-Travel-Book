import { describe, expect, it } from 'vitest';
import { formatDateRange, formatTripLength } from './dates.ts';

// ICU puts thin or narrow no-break spaces around the range dash; compare text only.
const plain = (s: string) => s.replace(/[\u2009\u202f\u00a0]/g, ' ');

describe('formatDateRange', () => {
  it('collapses shared month and year', () => {
    expect(plain(formatDateRange('2026-10-10', '2026-10-15'))).toBe('10 – 15 Oct 2026');
  });

  it('spans months and years', () => {
    expect(plain(formatDateRange('2026-10-30', '2026-11-02'))).toBe('30 Oct – 2 Nov 2026');
    expect(plain(formatDateRange('2026-12-28', '2027-01-03'))).toBe('28 Dec 2026 – 3 Jan 2027');
  });

  it('shows a one-day trip as a single date', () => {
    expect(plain(formatDateRange('2026-10-10', '2026-10-10'))).toBe('10 Oct 2026');
  });
});

describe('formatTripLength', () => {
  it('pluralizes days', () => {
    expect(formatTripLength('2026-10-10', '2026-10-10')).toBe('1 day');
    expect(formatTripLength('2026-10-10', '2026-10-15')).toBe('6 days');
  });
});
