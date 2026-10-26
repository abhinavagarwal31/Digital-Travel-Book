import { DateTime } from 'luxon';
import { isValidIsoDate } from '../schemas/common.ts';

/**
 * Capture-time facts as read from a photo's EXIF, before any interpretation.
 * localDateTime is the camera's wall clock ("YYYY-MM-DDTHH:mm:ss", no zone).
 */
export interface RawCaptureData {
  localDateTime?: string | undefined;
  offset?: string | undefined; // EXIF OffsetTime*, e.g. "+09:00"
  gpsDateTimeUtc?: string | undefined; // "YYYY-MM-DDTHH:mm:ssZ"
  lat?: number | undefined;
  lng?: number | undefined;
}

export type TimeSource = 'exif-offset' | 'gps-pair' | 'gps-zone' | 'book-default';

export interface ResolvedTime {
  /** The absolute moment (ISO, UTC), or null when no capture time is known. */
  capturedAt: string | null;
  /** Wall-clock time where the photo was taken; its date is the photo's day. */
  localDateTime: string | null;
  timeSource: TimeSource | null;
  /** True when the zone was assumed rather than recorded (book default, DST edge). */
  tzAssumed: boolean;
}

export interface TimeContext {
  /** The book's IANA zone, used when nothing better is known. */
  defaultTz: string;
  /** IANA zone at a coordinate (geo-tz on the server), or null if unknown. */
  zoneAt: (lat: number, lng: number) => string | null;
}

const LOCAL_DATE_TIME = /^(\d{4}-\d{2}-\d{2})T([01]\d|2[0-3]):([0-5]\d):([0-5]\d)$/;
const OFFSET = /^([+-])(\d{2}):(\d{2})$/;
const MIN_OFFSET = -12 * 60;
const MAX_OFFSET = 14 * 60;
const MINUTE = 60_000;
const DAY = 86_400_000;

export function isValidLocalDateTime(value: string | undefined): value is string {
  const match = value ? LOCAL_DATE_TIME.exec(value) : null;
  return match !== null && isValidIsoDate(match[1] ?? '');
}

/** Real coordinates only: finite, in range, and not the (0, 0) "null island" placeholder. */
export function isValidGps(lat: number | undefined, lng: number | undefined): boolean {
  return (
    typeof lat === 'number' &&
    typeof lng === 'number' &&
    Number.isFinite(lat) &&
    Number.isFinite(lng) &&
    Math.abs(lat) <= 90 &&
    Math.abs(lng) <= 180 &&
    !(lat === 0 && lng === 0)
  );
}

/** "+09:00" → 540 minutes, or null when malformed or outside UTC−12…UTC+14. */
export function parseOffset(value: string | undefined): number | null {
  const match = value ? OFFSET.exec(value) : null;
  if (!match) return null;
  const minutes = Number(match[2]) * 60 + Number(match[3]);
  const signed = match[1] === '-' ? -minutes : minutes;
  return signed >= MIN_OFFSET && signed <= MAX_OFFSET ? signed : null;
}

/** The wall-clock reading as if it were UTC, in epoch ms. */
function wallClockMs(localDateTime: string): number {
  return Date.parse(`${localDateTime}Z`);
}

function iso(ms: number): string {
  return new Date(ms).toISOString();
}

function offsetAt(zone: string, ms: number): number {
  return DateTime.fromMillis(ms, { zone }).offset;
}

/**
 * Converts a wall-clock time in an IANA zone to UTC without relying on library
 * defaults at daylight-saving changes. In an overlap (the hour that happens
 * twice) the earlier moment is used; in a gap (a time that never happened) the
 * offset from before the change is used. Both are reported as ambiguous.
 */
export function zonedWallClockToUtc(
  localDateTime: string,
  zone: string,
): { ms: number; ambiguous: boolean } | null {
  if (!DateTime.local().setZone(zone).isValid) return null;
  const wall = wallClockMs(localDateTime);
  const candidateOffsets = new Set([
    offsetAt(zone, wall - DAY),
    offsetAt(zone, wall),
    offsetAt(zone, wall + DAY),
  ]);
  const instants = [...candidateOffsets]
    .map((offset) => wall - offset * MINUTE)
    .filter((ms) => wall - offsetAt(zone, ms) * MINUTE === ms)
    .sort((a, b) => a - b);

  if (instants.length === 1) return { ms: instants[0] as number, ambiguous: false };
  if (instants.length > 1) return { ms: instants[0] as number, ambiguous: true };
  return { ms: wall - offsetAt(zone, wall - DAY) * MINUTE, ambiguous: true };
}

/**
 * The camera clock minus GPS UTC gives the zone offset, but only when the two
 * agree to within 30 s of a whole quarter hour; a stale GPS fix is ignored.
 */
function offsetFromGpsPair(localDateTime: string, gpsDateTimeUtc: string): number | null {
  const gps = Date.parse(gpsDateTimeUtc);
  if (!Number.isFinite(gps)) return null;
  const diffMinutes = (wallClockMs(localDateTime) - gps) / MINUTE;
  const rounded = Math.round(diffMinutes / 15) * 15;
  if (Math.abs(diffMinutes - rounded) > 0.5) return null;
  return rounded >= MIN_OFFSET && rounded <= MAX_OFFSET ? rounded : null;
}

const NO_TIME: ResolvedTime = {
  capturedAt: null,
  localDateTime: null,
  timeSource: null,
  tzAssumed: false,
};

/**
 * Resolves when a photo was taken, in the agreed order of trust:
 * 1. an explicit EXIF offset; 2. camera clock paired with GPS UTC time;
 * 3. the zone at the GPS position; 4. the book's default zone (assumed).
 * Without a camera clock, GPS UTC time plus the zone at the GPS position still
 * gives an exact local time. With neither, nothing is invented.
 */
export function resolveCaptureTime(raw: RawCaptureData, context: TimeContext): ResolvedTime {
  const hasGps = isValidGps(raw.lat, raw.lng);
  const zoneHere = hasGps ? context.zoneAt(raw.lat as number, raw.lng as number) : null;

  if (!isValidLocalDateTime(raw.localDateTime)) {
    const gps = raw.gpsDateTimeUtc ? Date.parse(raw.gpsDateTimeUtc) : NaN;
    if (!Number.isFinite(gps) || !zoneHere) return NO_TIME;
    const local = DateTime.fromMillis(gps, { zone: zoneHere }).toFormat("yyyy-MM-dd'T'HH:mm:ss");
    return { capturedAt: iso(gps), localDateTime: local, timeSource: 'gps-zone', tzAssumed: false };
  }

  const local = raw.localDateTime;
  const exact = (offset: number, timeSource: TimeSource): ResolvedTime => ({
    capturedAt: iso(wallClockMs(local) - offset * MINUTE),
    localDateTime: local,
    timeSource,
    tzAssumed: false,
  });

  const exifOffset = parseOffset(raw.offset);
  if (exifOffset !== null) return exact(exifOffset, 'exif-offset');

  if (raw.gpsDateTimeUtc) {
    const pairOffset = offsetFromGpsPair(local, raw.gpsDateTimeUtc);
    if (pairOffset !== null) return exact(pairOffset, 'gps-pair');
  }

  const zoned = (zone: string, timeSource: TimeSource, assumed: boolean): ResolvedTime | null => {
    const utc = zonedWallClockToUtc(local, zone);
    if (!utc) return null;
    return {
      capturedAt: iso(utc.ms),
      localDateTime: local,
      timeSource,
      tzAssumed: assumed || utc.ambiguous,
    };
  };

  return (
    (zoneHere && zoned(zoneHere, 'gps-zone', false)) ||
    zoned(context.defaultTz, 'book-default', true) || {
      // An unusable default zone still leaves the wall clock, which fixes the day.
      capturedAt: null,
      localDateTime: local,
      timeSource: null,
      tzAssumed: true,
    }
  );
}

/** The photo's day: the date on the wall clock where it was taken (midnight boundary). */
export function dayDateOf(localDateTime: string | null): string | null {
  return localDateTime ? localDateTime.slice(0, 10) : null;
}

function addDays(isoDate: string, days: number): string {
  return new Date(Date.parse(`${isoDate}T00:00:00Z`) + days * DAY).toISOString().slice(0, 10);
}

/** More than one day outside the trip: probably a wrong camera clock, so not given a day. */
export function isOutsideTrip(dayDate: string, startDate: string, endDate: string): boolean {
  return dayDate < addDays(startDate, -1) || dayDate > addDays(endDate, 1);
}
