import type { RawCaptureData } from '@tb/shared';
import exifr from 'exifr';

export type ImageMime = 'image/jpeg' | 'image/png' | 'image/webp' | 'image/heic';

const HEIF_BRANDS = new Set(['heic', 'heix', 'hevc', 'hevx', 'heim', 'heis', 'mif1', 'msf1']);

/**
 * The real type of an uploaded file from its first bytes. The browser's claimed
 * MIME type and the file extension are never trusted.
 */
export function sniffImageType(bytes: Buffer): ImageMime | null {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return 'image/jpeg';
  }
  if (bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
    return 'image/png';
  }
  if (bytes.toString('latin1', 0, 4) === 'RIFF' && bytes.toString('latin1', 8, 12) === 'WEBP') {
    return 'image/webp';
  }
  if (
    bytes.toString('latin1', 4, 8) === 'ftyp' &&
    HEIF_BRANDS.has(bytes.toString('latin1', 8, 12))
  ) {
    return 'image/heic';
  }
  return null;
}

/** Raw capture data plus camera identity, exactly as the file states it. */
export interface RawExif extends RawCaptureData {
  make?: string;
  model?: string;
}

type ExifValue = string | number | number[] | Uint8Array | undefined;

const EXIF_DATE_TIME = /^(\d{4}):(\d{2}):(\d{2})[ T](\d{2}):(\d{2}):(\d{2})/;

/** "2026:10:12 17:42:10" → "2026-10-12T17:42:10"; anything else → undefined. */
function exifDateTime(value: ExifValue): string | undefined {
  const match = typeof value === 'string' ? EXIF_DATE_TIME.exec(value.trim()) : null;
  if (!match) return undefined;
  const [, y, mo, d, h, mi, s] = match;
  return `${y}-${mo}-${d}T${h}:${mi}:${s}`;
}

function text(value: ExifValue): string | undefined {
  // EXIF strings are often NUL-padded fixed-width fields.
  const cleaned = typeof value === 'string' ? value.replace(/\0/g, '').trim() : '';
  return cleaned === '' ? undefined : cleaned;
}

/** Degrees/minutes/seconds plus N/S/E/W → signed decimal degrees. */
function coordinate(dms: ExifValue, ref: ExifValue): number | undefined {
  if (!Array.isArray(dms) || dms.length !== 3 || !dms.every(Number.isFinite)) return undefined;
  const [deg, min, sec] = dms as [number, number, number];
  const value = deg + min / 60 + sec / 3600;
  const ref_ = text(ref)?.toUpperCase();
  return ref_ === 'S' || ref_ === 'W' ? -value : value;
}

function gpsDateTime(date: ExifValue, time: ExifValue): string | undefined {
  const day = typeof date === 'string' ? /^(\d{4}):(\d{2}):(\d{2})$/.exec(date.trim()) : null;
  if (!day || !Array.isArray(time) || time.length !== 3 || !time.every(Number.isFinite)) {
    return undefined;
  }
  const [h, m, s] = (time as number[]).map((n) => String(Math.floor(n)).padStart(2, '0'));
  return `${day[1]}-${day[2]}-${day[3]}T${h}:${m}:${s}Z`;
}

/**
 * Reads capture data from the original file bytes. Missing or corrupt metadata
 * yields empty fields, never an error and never a guess. The edit time
 * (IFD0 DateTime / ModifyDate) is deliberately ignored: it is not when the
 * photo was taken.
 */
export async function readExif(bytes: Buffer): Promise<RawExif> {
  let tags: Record<string, ExifValue> | undefined;
  try {
    tags = await exifr.parse(bytes, {
      tiff: true,
      exif: true,
      gps: true,
      ifd1: false,
      interop: false,
      xmp: false,
      icc: false,
      iptc: false,
      jfif: false,
      ihdr: false,
      // Keep raw strings: revived Dates would be read in the server's own zone.
      reviveValues: false,
    });
  } catch {
    return {};
  }
  if (!tags) return {};

  const result: RawExif = {};
  const local = exifDateTime(tags.DateTimeOriginal) ?? exifDateTime(tags.CreateDate);
  if (local) result.localDateTime = local;

  const offset =
    text(tags.OffsetTimeOriginal) ?? text(tags.OffsetTimeDigitized) ?? text(tags.OffsetTime);
  if (offset) result.offset = offset;

  const lat = coordinate(tags.GPSLatitude, tags.GPSLatitudeRef);
  const lng = coordinate(tags.GPSLongitude, tags.GPSLongitudeRef);
  if (lat !== undefined && lng !== undefined) {
    result.lat = lat;
    result.lng = lng;
  }

  const gpsUtc = gpsDateTime(tags.GPSDateStamp, tags.GPSTimeStamp);
  if (gpsUtc) result.gpsDateTimeUtc = gpsUtc;

  const make = text(tags.Make);
  const model = text(tags.Model);
  if (make) result.make = make;
  if (model) result.model = model;
  return result;
}
