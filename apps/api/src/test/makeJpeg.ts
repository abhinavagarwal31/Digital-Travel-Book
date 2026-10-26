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

type Rgb = [number, number, number];

export interface TestJpegOptions {
  width?: number;
  height?: number;
  /** Fill colour, so fixture photos are told apart at a glance in the UI. */
  rgb?: Rgb;
  /** A sky-to-ground landscape instead of a flat fill: [sky, horizon, ground]. */
  scene?: [Rgb, Rgb, Rgb];
  exif?: TestExif;
}

const mix = (a: number, b: number, t: number) => Math.round(a + (b - a) * t);

/** A soft landscape: sky gradient, a sun, and a ground band below the horizon. */
function sceneJpeg(width: number, height: number, [sky, horizon, ground]: [Rgb, Rgb, Rgb]): Buffer {
  const data = Buffer.alloc(width * height * 4);
  const horizonY = Math.round(height * 0.62);
  const sun = { x: width * 0.7, y: height * 0.38, r: height * 0.09 };
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      let rgb: Rgb;
      if (y < horizonY) {
        const t = y / horizonY;
        rgb = [mix(sky[0], horizon[0], t), mix(sky[1], horizon[1], t), mix(sky[2], horizon[2], t)];
        const d = Math.hypot(x - sun.x, y - sun.y);
        if (d < sun.r * 2.5) {
          const glow = Math.max(0, 1 - d / (sun.r * 2.5)) ** 2;
          rgb = rgb.map((c) => mix(c, 255, d < sun.r ? 0.85 : glow * 0.6)) as Rgb;
        }
      } else {
        const t = (y - horizonY) / (height - horizonY);
        const ridge = Math.sin(x / (width / 9)) * 0.06;
        rgb = ground.map((c) => Math.round(c * (1 - t * 0.45 + ridge))) as Rgb;
      }
      data.writeUInt8(Math.max(0, Math.min(255, rgb[0])), i);
      data.writeUInt8(Math.max(0, Math.min(255, rgb[1])), i + 1);
      data.writeUInt8(Math.max(0, Math.min(255, rgb[2])), i + 2);
      data.writeUInt8(255, i + 3);
    }
  }
  return jpeg.encode({ data, width, height }, 82).data;
}

function solidJpeg(width: number, height: number, [r, g, b]: Rgb): Buffer {
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
  const width = options.width ?? 64;
  const height = options.height ?? 48;
  const image = options.scene
    ? sceneJpeg(width, height, options.scene)
    : solidJpeg(width, height, options.rgb ?? [200, 120, 80]);
  if (!options.exif) return image;
  const withExif = piexif.insert(piexif.dump(exifObject(options.exif)), image.toString('binary'));
  return Buffer.from(withExif, 'binary');
}
