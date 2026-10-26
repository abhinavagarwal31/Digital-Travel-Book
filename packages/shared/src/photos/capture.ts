import {
  dayDateOf,
  isOutsideTrip,
  isValidGps,
  resolveCaptureTime,
  type RawCaptureData,
  type TimeContext,
  type TimeSource,
} from './time.ts';

/** Problems a single photo can have on its own (outliers need its neighbours). */
export type PhotoOwnFlag = 'no_time' | 'tz_assumed' | 'outside_trip';

/** The working fields derived from one photo's raw EXIF; raw EXIF itself is kept separately. */
export interface PhotoCaptureFields {
  capturedAt: string | null;
  localDateTime: string | null;
  timeSource: TimeSource | null;
  gps: { lat: number; lng: number } | null;
  dayDate: string | null;
  flags: PhotoOwnFlag[];
}

export interface TripContext {
  startDate: string;
  endDate: string;
  defaultTz: string;
}

/**
 * Everything that can be decided about a photo from its own metadata and the
 * book. A photo far outside the trip keeps its time but gets no day, so a wrong
 * camera clock surfaces for review instead of creating a stray day.
 */
export function captureFields(
  raw: RawCaptureData,
  trip: TripContext,
  zoneAt: TimeContext['zoneAt'],
): PhotoCaptureFields {
  const time = resolveCaptureTime(raw, { defaultTz: trip.defaultTz, zoneAt });
  const gps = isValidGps(raw.lat, raw.lng)
    ? { lat: raw.lat as number, lng: raw.lng as number }
    : null;

  const flags: PhotoOwnFlag[] = [];
  let dayDate = dayDateOf(time.localDateTime);
  if (!time.localDateTime) flags.push('no_time');
  if (time.tzAssumed) flags.push('tz_assumed');
  if (dayDate && isOutsideTrip(dayDate, trip.startDate, trip.endDate)) {
    flags.push('outside_trip');
    dayDate = null;
  }

  return {
    capturedAt: time.capturedAt,
    localDateTime: time.localDateTime,
    timeSource: time.timeSource,
    gps,
    dayDate,
    flags,
  };
}
