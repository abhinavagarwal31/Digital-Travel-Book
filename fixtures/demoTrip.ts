// Synthetic trip photos with real EXIF, for the demo (npm run fixtures) and
// the end-to-end tests. Written to git-ignored folders, never committed.
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { makeJpeg, type TestExif } from '../apps/api/src/test/makeJpeg.ts';

type Rgb = [number, number, number];
const SCENES: Record<string, [Rgb, Rgb, Rgb]> = {
  dawn: [
    [120, 160, 210],
    [250, 200, 170],
    [70, 90, 80],
  ],
  noon: [
    [90, 150, 220],
    [190, 220, 240],
    [80, 120, 70],
  ],
  dusk: [
    [60, 60, 120],
    [240, 140, 90],
    [60, 50, 60],
  ],
  night: [
    [15, 20, 50],
    [70, 60, 110],
    [30, 30, 40],
  ],
  forest: [
    [150, 190, 170],
    [220, 230, 200],
    [40, 90, 50],
  ],
  temple: [
    [200, 120, 90],
    [250, 210, 170],
    [120, 50, 40],
  ],
};

interface DemoPhoto {
  file: string;
  scene: keyof typeof SCENES;
  exif?: TestExif;
  /** What the app should conclude, for tests and for checking the demo by eye. */
  expect: { dayDate: string | null; flags: string[] };
}

const phone = (time: string, lat: number, lng: number): TestExif => ({
  dateTimeOriginal: time,
  offsetTimeOriginal: '+09:00',
  gps: { lat, lng },
  make: 'Apple',
  model: 'iPhone 15',
});

const DEMO_TRIP: DemoPhoto[] = [
  {
    file: 'IMG_1001.JPG',
    scene: 'noon',
    exif: phone('2026:10:10 10:15:00', 35.6595, 139.7005),
    expect: { dayDate: '2026-10-10', flags: [] },
  },
  {
    file: 'IMG_1002.JPG',
    scene: 'temple',
    exif: phone('2026:10:10 14:30:00', 35.7148, 139.7967),
    expect: { dayDate: '2026-10-10', flags: [] },
  },
  {
    file: 'IMG_1003.JPG',
    scene: 'night',
    exif: phone('2026:10:10 19:40:00', 35.6586, 139.7454),
    expect: { dayDate: '2026-10-10', flags: [] },
  },
  {
    file: 'IMG_1004.JPG',
    scene: 'forest',
    exif: phone('2026:10:11 09:20:00', 35.6764, 139.6993),
    expect: { dayDate: '2026-10-11', flags: [] },
  },
  {
    file: 'IMG_1005.JPG',
    scene: 'night',
    exif: phone('2026:10:11 22:10:00', 35.6938, 139.7034),
    expect: { dayDate: '2026-10-11', flags: [] },
  },
  {
    file: 'IMG_1006.JPG',
    scene: 'temple',
    exif: phone('2026:10:12 08:05:00', 34.9671, 135.7727),
    expect: { dayDate: '2026-10-12', flags: [] },
  },
  {
    file: 'IMG_1007.JPG',
    scene: 'dusk',
    exif: phone('2026:10:12 18:30:00', 35.0037, 135.7788),
    expect: { dayDate: '2026-10-12', flags: [] },
  },
  // A camera without GPS or an offset: dated by the book's zone, flagged as assumed.
  {
    file: 'DSC_0420.JPG',
    scene: 'temple',
    exif: { dateTimeOriginal: '2026:10:12 16:45:00', make: 'Canon', model: 'EOS R6' },
    expect: { dayDate: '2026-10-12', flags: ['tz_assumed'] },
  },
  {
    file: 'IMG_1008.JPG',
    scene: 'forest',
    exif: phone('2026:10:13 07:45:00', 35.017, 135.6713),
    expect: { dayDate: '2026-10-13', flags: [] },
  },
  {
    file: 'IMG_1009.JPG',
    scene: 'noon',
    exif: phone('2026:10:13 13:10:00', 35.0394, 135.7292),
    expect: { dayDate: '2026-10-13', flags: [] },
  },
  {
    file: 'IMG_1010.JPG',
    scene: 'dawn',
    exif: phone('2026:10:14 11:00:00', 34.6851, 135.843),
    expect: { dayDate: '2026-10-14', flags: [] },
  },
  {
    file: 'IMG_1011.JPG',
    scene: 'night',
    exif: phone('2026:10:14 20:45:00', 34.6687, 135.5013),
    expect: { dayDate: '2026-10-14', flags: [] },
  },
  {
    file: 'IMG_1012.JPG',
    scene: 'noon',
    exif: phone('2026:10:15 10:30:00', 34.6873, 135.5262),
    expect: { dayDate: '2026-10-15', flags: [] },
  },
  // A screenshot or messaging-app copy: no metadata at all.
  { file: 'Screenshot_ticket.jpg', scene: 'dawn', expect: { dayDate: null, flags: ['no_time'] } },
];

export const DEMO_TRIP_DATES = {
  startDate: '2026-10-10',
  endDate: '2026-10-15',
  defaultTz: 'Asia/Tokyo',
};

/** Writes the 14-photo demo trip and a manifest of what the app should conclude. */
export function writeDemoTrip(out: string): string[] {
  rmSync(out, { recursive: true, force: true });
  mkdirSync(out, { recursive: true });
  for (const photo of DEMO_TRIP) {
    const bytes = makeJpeg({
      width: 960,
      height: 720,
      scene: SCENES[photo.scene],
      exif: photo.exif,
    });
    writeFileSync(join(out, photo.file), bytes);
  }
  writeFileSync(
    join(out, 'manifest.json'),
    JSON.stringify(
      { trip: DEMO_TRIP_DATES, photos: DEMO_TRIP.map(({ file, expect }) => ({ file, expect })) },
      null,
      2,
    ),
  );
  return DEMO_TRIP.map((p) => p.file);
}

/**
 * A larger trip for load testing: `count` small photos spread over the six
 * days and walking between Tokyo and Osaka, a few minutes apart.
 */
export function writeBulkTrip(out: string, count: number): string[] {
  rmSync(out, { recursive: true, force: true });
  mkdirSync(out, { recursive: true });
  const scenes = Object.values(SCENES);
  const files: string[] = [];
  for (let i = 0; i < count; i++) {
    const day = 10 + Math.floor((i * 6) / count);
    const minutes = 8 * 60 + ((i * 37) % (12 * 60));
    const time = `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}:00`;
    const t = i / Math.max(1, count - 1);
    const file = `BULK_${String(i).padStart(4, '0')}.JPG`;
    const bytes = makeJpeg({
      width: 320,
      height: 240,
      scene: scenes[i % scenes.length],
      exif: phone(`2026:10:${day} ${time}`, 35.68 - t * 1.0, 139.76 - t * 4.25),
    });
    writeFileSync(join(out, file), bytes);
    files.push(file);
  }
  return files;
}
