import jpeg from 'jpeg-js';
import piexif from 'piexifjs';

// piexifjs predates EXIF 2.31; teach it the offset tags modern phones write.
const OFFSET_TIME = 36880;
const OFFSET_TIME_ORIGINAL = 36881;
piexif.TAGS.Exif[OFFSET_TIME] ??= { name: 'OffsetTime', type: 'Ascii' };
piexif.TAGS.Exif[OFFSET_TIME_ORIGINAL] ??= { name: 'OffsetTimeOriginal', type: 'Ascii' };

/** EXIF to write. Dates use EXIF's own "YYYY:MM:DD HH:mm:ss" format. */
export interface TestExif {
  dateTimeOriginal?: string;
  createDate?: string; // DateTimeDigitized
  modifyDate?: string; // IFD0 DateTime: edit time, never a capture time
  offsetTimeOriginal?: string;
  offsetTime?: string;
  gps?: { lat: number; lng: number };
  gpsDateTimeUtc?: string; // "YYYY-MM-DDTHH:mm:ssZ"
  make?: string;
  model?: string;
}

export interface TestJpegOptions {
  width?: number;
  height?: number;
  /** Fill colour, so fixture photos are told apart at a glance in the UI. */
  rgb?: [number, number, number];
  exif?: TestExif;
}

function solidJpeg(width: number, height: number, [r, g, b]: [number, number, number]): Buffer {
  const data = Buffer.alloc(width * height * 4);
  for (let i = 0; i < width * height; i++) {
    // A diagonal band adds a little texture so the image is not a flat swatch.
    const shade = (i % width) + Math.floor(i / width) < (width + height) / 2 ? 1 : 0.8;
    data.writeUInt8(Math.round(r * shade), i * 4);
    data.writeUInt8(Math.round(g * shade), i * 4 + 1);
    data.writeUInt8(Math.round(b * shade), i * 4 + 2);
    data.writeUInt8(255, i * 4 + 3);
  }
  return jpeg.encode({ data, width, height }, 85).data;
}

function exifObject(exif: TestExif): Record<string, Record<number, unknown>> {
  const zeroth: Record<number, unknown> = {};
  const exifIfd: Record<number, unknown> = {};
  const gps: Record<number, unknown> = {};

  if (exif.make) zeroth[piexif.ImageIFD.Make] = exif.make;
  if (exif.model) zeroth[piexif.ImageIFD.Model] = exif.model;
  if (exif.modifyDate) zeroth[piexif.ImageIFD.DateTime] = exif.modifyDate;
  if (exif.dateTimeOriginal) exifIfd[piexif.ExifIFD.DateTimeOriginal] = exif.dateTimeOriginal;
  if (exif.createDate) exifIfd[piexif.ExifIFD.DateTimeDigitized] = exif.createDate;
  if (exif.offsetTimeOriginal) exifIfd[OFFSET_TIME_ORIGINAL] = exif.offsetTimeOriginal;
  if (exif.offsetTime) exifIfd[OFFSET_TIME] = exif.offsetTime;

  if (exif.gps) {
    gps[piexif.GPSIFD.GPSLatitudeRef] = exif.gps.lat >= 0 ? 'N' : 'S';
    gps[piexif.GPSIFD.GPSLatitude] = piexif.GPSHelper.degToDmsRational(Math.abs(exif.gps.lat));
    gps[piexif.GPSIFD.GPSLongitudeRef] = exif.gps.lng >= 0 ? 'E' : 'W';
    gps[piexif.GPSIFD.GPSLongitude] = piexif.GPSHelper.degToDmsRational(Math.abs(exif.gps.lng));
  }
  if (exif.gpsDateTimeUtc) {
    const [date, time] = exif.gpsDateTimeUtc.replace('Z', '').split('T') as [string, string];
    const [h, m, s] = time.split(':').map(Number) as [number, number, number];
    gps[piexif.GPSIFD.GPSDateStamp] = date.replaceAll('-', ':');
    gps[piexif.GPSIFD.GPSTimeStamp] = [
      [h, 1],
      [m, 1],
      [s, 1],
    ];
  }
  return { '0th': zeroth, Exif: exifIfd, GPS: gps };
}

/** A real JPEG file, optionally carrying the given EXIF. */
export function makeJpeg(options: TestJpegOptions = {}): Buffer {
  const image = solidJpeg(options.width ?? 64, options.height ?? 48, options.rgb ?? [200, 120, 80]);
  if (!options.exif) return image;
  const withExif = piexif.insert(piexif.dump(exifObject(options.exif)), image.toString('binary'));
  return Buffer.from(withExif, 'binary');
}
