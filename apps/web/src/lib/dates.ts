import { tripLengthDays } from '@tb/shared';

// Trip dates are calendar dates with no zone, so they are formatted in UTC to
// stop the viewer's own time zone from shifting them by a day.
const dayMonthYear = new Intl.DateTimeFormat('en-GB', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  timeZone: 'UTC',
});

function toDate(isoDate: string): Date {
  return new Date(`${isoDate}T00:00:00Z`);
}

/** "10 – 15 Oct 2026", "30 Oct – 2 Nov 2026" or "28 Dec 2026 – 3 Jan 2027". */
export function formatDateRange(startDate: string, endDate: string): string {
  return dayMonthYear.formatRange(toDate(startDate), toDate(endDate));
}

export function formatTripLength(startDate: string, endDate: string): string {
  const days = tripLengthDays(startDate, endDate);
  return days === 1 ? '1 day' : `${days} days`;
}

/** The browser's IANA zone, used as the default for a new book. */
export function browserTimeZone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone;
}

const weekdayDayMonth = new Intl.DateTimeFormat('en-GB', {
  weekday: 'short',
  day: 'numeric',
  month: 'short',
  timeZone: 'UTC',
});

/** "Day 3 · Mon 12 Oct": the day's place in the trip, then its date. */
export function formatDayHeading(dayDate: string, tripStartDate: string): string {
  const dayNumber = tripLengthDays(tripStartDate, dayDate);
  const date = weekdayDayMonth.format(toDate(dayDate));
  return dayNumber >= 1 ? `Day ${dayNumber} · ${date}` : date;
}
