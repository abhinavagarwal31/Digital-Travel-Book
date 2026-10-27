// A full test dataset for checking the whole app by hand: a 7-day Rajasthan
// road trip whose photos carry deliberately different metadata, plus files
// that must be refused, re-uploads, and a set to hit the plan's photo limit.
// Every photo shows on its face what it tests. Run: npm run fixtures:test-photos
import { execFileSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { jpegFromPixels, type TestExif } from '../apps/api/src/test/makeJpeg.ts';
import { Canvas, grain, paintScene, seeded, type Scene } from './painter.ts';

export const TRIP = {
  title: 'Rajasthan Road Trip',
  startDate: '2026-11-14',
  endDate: '2026-11-20',
  timeZone: 'Asia/Kolkata',
  destinations: 'Jaipur, Jodhpur, Jaisalmer, Udaipur',
};

interface TestPhoto {
  file: string;
  scene: Scene;
  light?: 'day' | 'sunset' | 'night';
  portrait?: boolean;
  /** What the photo shows, and what it is testing. */
  title: string;
  detail: string;
  exif?: TestExif;
  /** Written as JPEG, then converted on macOS (sips) for HEIC and PNG. */
  format?: 'jpeg' | 'heic' | 'png';
  /** What the app should do with it: goes into the guide. */
  expect: string;
}

const IST = '+05:30';
const exifTime = (date: string, time: string) => `${date.replaceAll('-', ':')} ${time}:00`;

/** A phone photo as most phones write it: time, time zone and location. */
function phone(
  date: string,
  time: string,
  at: [number, number],
  device: 'iphone' | 'samsung' = 'iphone',
): TestExif {
  return {
    dateTimeOriginal: exifTime(date, time),
    offsetTimeOriginal: IST,
    gps: { lat: at[0], lng: at[1] },
    ...(device === 'iphone'
      ? { make: 'Apple', model: 'iPhone 15' }
      : { make: 'samsung', model: 'SM-S918B' }),
  };
}

const PLACES = {
  delhiCP: [28.6315, 77.2167],
  delhiAirport: [28.5562, 77.1],
  hawaMahal: [26.9239, 75.8267],
  cityPalaceJaipur: [26.9258, 75.8237],
  jalMahal: [26.9535, 75.8463],
  johari: [26.9196, 75.8235],
  amber: [26.9855, 75.8513],
  albertHall: [26.9116, 75.8195],
  london: [51.5007, -0.1246],
  mehrangarh: [26.2978, 73.0185],
  blueCity: [26.2967, 73.023],
  clockTower: [26.2932, 73.0244],
  jaisalmerFort: [26.9124, 70.9126],
  samDunes: [26.8445, 70.5156],
  udaipurPalace: [24.5764, 73.6835],
  pichola: [24.572, 73.6797],
  sajjangarh: [24.5946, 73.6467],
  goa: [15.5527, 73.7517],
} satisfies Record<string, [number, number]>;

export const TRIP_PHOTOS: TestPhoto[] = [
  {
    file: '01_Delhi_the_night_before.jpg',
    scene: 'market',
    light: 'night',
    title: 'DELHI · NIGHT BEFORE',
    detail: '13 NOV 21:15 · DAY BEFORE THE TRIP',
    exif: phone('2026-11-13', '21:15', PLACES.delhiCP),
    expect: 'A day before Day 1 ("Before the trip"), with its own pin in Delhi.',
  },
  {
    file: '02_Delhi_airport.jpg',
    scene: 'airport',
    title: 'DELHI AIRPORT',
    detail: 'DAY 1 · 06:20 · NORMAL PHONE PHOTO',
    exif: phone('2026-11-14', '06:20', PLACES.delhiAirport),
    expect: 'Day 1. Not flagged: Delhi to Jaipur in 5 hours is a normal journey.',
  },
  {
    file: '03_ticket_screenshot.png',
    scene: 'ticket',
    portrait: true,
    title: 'SCREENSHOT',
    detail: 'PNG · NO DATE · NO PLACE',
    format: 'png',
    expect: 'In the "To sort" tray, reason "No date". Move it to Day 1 by hand.',
  },
  {
    file: '04_Hawa_Mahal.jpg',
    scene: 'palace',
    title: 'JAIPUR · HAWA MAHAL',
    detail: 'DAY 1 · 11:20 · NORMAL PHONE PHOTO',
    exif: phone('2026-11-14', '11:20', PLACES.hawaMahal),
    expect: 'Day 1, first stop in Jaipur.',
  },
  {
    file: '05_City_Palace.jpg',
    scene: 'fort',
    title: 'JAIPUR · CITY PALACE',
    detail: 'DAY 1 · 13:05 · NORMAL PHONE PHOTO',
    exif: phone('2026-11-14', '13:05', PLACES.cityPalaceJaipur),
    expect: 'Day 1, same stop as the Hawa Mahal (they are a few hundred metres apart).',
  },
  {
    file: '06_GPS_glitch_says_London.jpg',
    scene: 'palace',
    title: 'GPS GLITCH: SAYS LONDON',
    detail: 'DAY 1 · 14:10 · REALLY IN JAIPUR',
    exif: phone('2026-11-14', '14:10', PLACES.london),
    expect:
      'Day 1, but under "Check these": its location jumps to London and back within hours. Press "Remove location".',
  },
  {
    file: '07_Jal_Mahal_sunset.heic',
    scene: 'lake',
    light: 'sunset',
    title: 'JAIPUR · JAL MAHAL',
    detail: 'DAY 1 · 17:45 · IPHONE HEIC',
    exif: phone('2026-11-14', '17:45', PLACES.jalMahal),
    format: 'heic',
    expect: 'Day 1. An iPhone HEIC file, read just like a JPEG.',
  },
  {
    file: '08_Johari_Bazaar_night.jpg',
    scene: 'market',
    light: 'night',
    title: 'JAIPUR · JOHARI BAZAAR',
    detail: 'DAY 1 · 20:30 · NORMAL PHONE PHOTO',
    exif: phone('2026-11-14', '20:30', PLACES.johari),
    expect: 'Day 1, evening.',
  },
  {
    file: '09_Amber_Fort_1.jpg',
    scene: 'fort',
    title: 'AMBER FORT · 1 OF 3',
    detail: 'DAY 2 · 09:00 · NORMAL PHONE PHOTO',
    exif: phone('2026-11-15', '09:00', PLACES.amber),
    expect: 'Day 2. With the next two: one stop on the map, not three.',
  },
  {
    file: '10_Amber_Fort_2.jpg',
    scene: 'fort',
    light: 'day',
    title: 'AMBER FORT · 2 OF 3',
    detail: 'DAY 2 · 09:40 · NORMAL PHONE PHOTO',
    exif: phone('2026-11-15', '09:40', [26.9858, 75.8509]),
    expect: 'Day 2, same stop.',
  },
  {
    file: '11_Amber_Fort_3.heic',
    scene: 'fort',
    title: 'AMBER FORT · 3 OF 3',
    detail: 'DAY 2 · 10:30 · IPHONE HEIC',
    exif: phone('2026-11-15', '10:30', [26.9852, 75.8516]),
    format: 'heic',
    expect: 'Day 2, same stop.',
  },
  {
    file: '12_Albert_Hall_Samsung.jpg',
    scene: 'palace',
    title: 'ALBERT HALL · ANDROID',
    detail: 'DAY 2 · 11:00 · SAMSUNG PHONE',
    exif: phone('2026-11-15', '11:00', PLACES.albertHall, 'samsung'),
    expect: 'Day 2. An Android phone photo.',
  },
  {
    file: '13_lunch_zone_from_GPS_clock.jpg',
    scene: 'market',
    title: 'LUNCH · NO TIME ZONE',
    detail: 'DAY 2 · 12:30 · ZONE FROM GPS CLOCK',
    exif: {
      dateTimeOriginal: exifTime('2026-11-15', '12:30'),
      gpsDateTimeUtc: '2026-11-15T07:00:00Z',
      gps: { lat: 26.9205, lng: 75.8241 },
      make: 'Apple',
      model: 'iPhone 12',
    },
    expect: 'Day 2 at 12:30. No time zone in the photo: worked out from its GPS clock. No warning.',
  },
  {
    file: '14_Canon_camera_no_zone.jpg',
    scene: 'fort',
    title: 'CANON CAMERA',
    detail: 'DAY 2 · 15:00 · NO ZONE, NO GPS',
    exif: {
      dateTimeOriginal: exifTime('2026-11-15', '15:00'),
      make: 'Canon',
      model: 'EOS R6',
    },
    expect: 'Day 2, using the book\'s time zone. Marked "time zone assumed". No map pin.',
  },
  {
    file: '15_Hawa_Mahal_again.jpg',
    scene: 'palace',
    light: 'sunset',
    title: 'HAWA MAHAL · AGAIN',
    detail: 'DAY 2 · 18:10 · SAME PLACE, NEW DAY',
    exif: phone('2026-11-15', '18:10', PLACES.hawaMahal),
    expect: 'Day 2. Same place as on Day 1, but a separate visit: a new pin.',
  },
  {
    file: '16_just_after_midnight.jpg',
    scene: 'market',
    light: 'night',
    title: 'JUST AFTER MIDNIGHT',
    detail: '16 NOV 00:40 · MUST BE DAY 3',
    exif: phone('2026-11-16', '00:40', PLACES.johari),
    expect: 'Day 3, not Day 2: it is past midnight in India (still 15 Nov in UTC).',
  },
  {
    file: '17_Mehrangarh_Fort.jpg',
    scene: 'fort',
    title: 'JODHPUR · MEHRANGARH',
    detail: 'DAY 3 · 14:20 · NORMAL PHONE PHOTO',
    exif: phone('2026-11-16', '14:20', PLACES.mehrangarh),
    expect: 'Day 3, Jodhpur: should start a new chapter.',
  },
  {
    file: '18_Blue_City.jpg',
    scene: 'bluecity',
    title: 'JODHPUR · BLUE CITY',
    detail: 'DAY 3 · 16:00 · NORMAL PHONE PHOTO',
    exif: phone('2026-11-16', '16:00', PLACES.blueCity),
    expect: 'Day 3.',
  },
  {
    file: '19_Clock_Tower_zone_from_place.jpg',
    scene: 'market',
    light: 'night',
    title: 'CLOCK TOWER · NO ZONE',
    detail: 'DAY 3 · 19:30 · ZONE FROM LOCATION',
    exif: {
      dateTimeOriginal: exifTime('2026-11-16', '19:30'),
      gps: { lat: PLACES.clockTower[0], lng: PLACES.clockTower[1] },
      make: 'Xiaomi',
      model: 'Redmi Note 12',
    },
    expect: 'Day 3 at 19:30. Time zone worked out from where it was taken. No warning.',
  },
  {
    file: '20_Jaisalmer_Fort_digitised_time.jpg',
    scene: 'fort',
    title: 'JAISALMER FORT',
    detail: 'DAY 4 · 10:00 · ONLY "DIGITISED" TIME',
    exif: {
      createDate: exifTime('2026-11-17', '10:00'),
      offsetTimeOriginal: IST,
      gps: { lat: PLACES.jaisalmerFort[0], lng: PLACES.jaisalmerFort[1] },
      make: 'Apple',
      model: 'iPhone 15',
    },
    expect: 'Day 4. Has no "original" time, only the "digitised" one, which is used instead.',
  },
  {
    file: '21_Jaisalmer_Fort_2.jpg',
    scene: 'fort',
    light: 'day',
    title: 'JAISALMER FORT · 2',
    detail: 'DAY 4 · 11:15 · NORMAL PHONE PHOTO',
    exif: phone('2026-11-17', '11:15', [26.9128, 70.9122]),
    expect: 'Day 4, new chapter (Jaisalmer).',
  },
  {
    file: '22_Sam_Dunes_sunset.heic',
    scene: 'desert',
    light: 'sunset',
    title: 'SAM SAND DUNES',
    detail: 'DAY 4 · 17:30 · IPHONE HEIC',
    exif: phone('2026-11-17', '17:30', PLACES.samDunes),
    format: 'heic',
    expect: 'Day 4.',
  },
  {
    file: '23_Sam_Dunes_portrait.jpg',
    scene: 'desert',
    light: 'sunset',
    portrait: true,
    title: 'DUNES · PORTRAIT',
    detail: 'DAY 4 · 18:05 · TALL PHOTO',
    exif: phone('2026-11-17', '18:05', [26.8449, 70.5161]),
    expect: 'Day 4. A tall (portrait) photo: check it is not stretched anywhere.',
  },
  {
    file: '24_Udaipur_City_Palace.jpg',
    scene: 'palace',
    title: 'UDAIPUR · CITY PALACE',
    detail: 'DAY 6 · 10:30 · NORMAL PHONE PHOTO',
    exif: phone('2026-11-19', '10:30', PLACES.udaipurPalace),
    expect: 'Day 6, new chapter (Udaipur). Day 5 has no photos at all: a rest day.',
  },
  {
    file: '25_Lake_Pichola_boat.jpg',
    scene: 'lake',
    title: 'LAKE PICHOLA',
    detail: 'DAY 6 · 16:40 · NORMAL PHONE PHOTO',
    exif: phone('2026-11-19', '16:40', PLACES.pichola),
    expect: 'Day 6.',
  },
  {
    file: '26_Sajjangarh_sunset.heic',
    scene: 'fort',
    light: 'sunset',
    title: 'SAJJANGARH · SUNSET',
    detail: 'DAY 6 · 18:20 · IPHONE HEIC',
    exif: phone('2026-11-19', '18:20', PLACES.sajjangarh),
    format: 'heic',
    expect: 'Day 6.',
  },
  {
    file: '27_breakfast_GPS_zero_zero.jpg',
    scene: 'lake',
    title: 'BREAKFAST · GPS 0,0',
    detail: 'DAY 7 · 08:30 · BROKEN GPS (0,0)',
    exif: phone('2026-11-20', '08:30', [0, 0]),
    expect:
      'Day 7, but no map pin: a location of exactly 0,0 is a known GPS placeholder and is ignored.',
  },
  {
    file: '28_Lake_morning.jpg',
    scene: 'lake',
    title: 'LAKE PICHOLA · MORNING',
    detail: 'DAY 7 · 09:15 · NORMAL PHONE PHOTO',
    exif: phone('2026-11-20', '09:15', PLACES.pichola),
    expect: 'Day 7, the last day.',
  },
  {
    file: '29_WhatsApp_forward.jpg',
    scene: 'fort',
    title: 'WHATSAPP COPY',
    detail: 'NO DATA AT ALL (WHATSAPP STRIPS IT)',
    expect: 'In the "To sort" tray, reason "No date".',
  },
  {
    file: '30_location_but_no_time.jpg',
    scene: 'lake',
    title: 'LOCATION · NO TIME',
    detail: 'UDAIPUR GPS · NO DATE',
    exif: { gps: { lat: 24.5752, lng: 73.6818 } },
    expect: 'In the tray, reason "No date (has location)". It belongs on Day 6 or 7.',
  },
  {
    file: '31_edited_photo_only_edit_date.jpg',
    scene: 'bluecity',
    title: 'EDITED PHOTO',
    detail: 'ONLY AN EDIT DATE · NOT A CAPTURE DATE',
    exif: { modifyDate: '2026:11:21 10:00:00', make: 'Apple', model: 'iPhone 15' },
    expect:
      'In the tray, "No date": the edit date is ignored on purpose (it is not when the photo was taken).',
  },
  {
    file: '32_Goa_from_another_trip.jpg',
    scene: 'beach',
    title: 'GOA · ANOTHER TRIP',
    detail: '2 OCT 2026 · SIX WEEKS EARLIER',
    exif: phone('2026-10-02', '16:00', PLACES.goa),
    expect: 'In the tray, reason "Date outside the trip". Exclude it ("Leave out of the book").',
  },
];

const SIZE = { width: 1600, height: 1200 };

function drawPhoto(p: TestPhoto, seed: number): { data: Buffer; width: number; height: number } {
  const width = p.portrait ? SIZE.height : SIZE.width;
  const height = p.portrait ? SIZE.width : SIZE.height;
  const canvas = new Canvas(width, height);
  paintScene(canvas, { scene: p.scene, light: p.light, seed });
  grain(canvas, 10, seeded(seed * 7 + 1));
  canvas.label(p.title, p.detail);
  return { data: canvas.data, width, height };
}

const canConvert = process.platform === 'darwin' && existsSync('/usr/bin/sips');

/** Converts with macOS's own image tool, which keeps the EXIF. */
function convert(from: string, to: string, format: 'heic' | 'png' | 'gif') {
  execFileSync('/usr/bin/sips', ['-s', 'format', format, from, '--out', to], { stdio: 'ignore' });
  rmSync(from);
}

function writePhoto(dir: string, p: TestPhoto, seed: number) {
  const { data, width, height } = drawPhoto(p, seed);
  const jpeg = jpegFromPixels(data, width, height, p.exif, 88);
  const format = p.format ?? 'jpeg';
  if (format === 'jpeg' || !canConvert) {
    const name = format === 'jpeg' ? p.file : p.file.replace(/\.\w+$/, '.jpg');
    writeFileSync(join(dir, name), jpeg);
    return name;
  }
  const tmp = join(dir, `${p.file}.tmp.jpg`);
  writeFileSync(tmp, jpeg);
  convert(tmp, join(dir, p.file), format);
  return p.file;
}

export function writeTestPhotos(root: string) {
  rmSync(root, { recursive: true, force: true });
  const trip = join(root, '1-trip-photos');
  const again = join(root, '2-upload-again-duplicates');
  const refused = join(root, '3-should-be-refused');
  const limit = join(root, '4-photo-limit-201-photos');
  for (const d of [trip, again, refused, limit]) mkdirSync(d, { recursive: true });

  const written = TRIP_PHOTOS.map((p, i) => writePhoto(trip, p, i + 11));

  // The same files again under new names: the app recognises them by content.
  copyFileSync(join(trip, '04_Hawa_Mahal.jpg'), join(again, 'IMG_2041_copy.jpg'));
  copyFileSync(join(trip, '17_Mehrangarh_Fort.jpg'), join(again, 'Mehrangarh (1).jpg'));

  // Files the app must turn away, each for its own reason.
  const big = new Canvas(3200, 2400);
  const r = seeded(99);
  for (let i = 0; i < big.data.length; i += 4) {
    big.data[i] = r() * 255;
    big.data[i + 1] = r() * 255;
    big.data[i + 2] = r() * 255;
  }
  big.label('TOO BIG', 'OVER 10 MB · MUST BE REFUSED');
  writeFileSync(
    join(refused, 'huge_photo_over_10MB.jpg'),
    jpegFromPixels(big.data, 3200, 2400, undefined, 95),
  );
  writeFileSync(join(refused, 'empty_file.jpg'), Buffer.alloc(0));
  writeFileSync(join(refused, 'notes.txt'), 'Packing list: sunscreen, scarf, power bank.\n');
  writeFileSync(
    join(refused, 'not_really_a_photo.jpg'),
    'This is a text file pretending to be a photo by its name.\n',
  );
  if (canConvert) {
    const small = new Canvas(400, 300);
    paintScene(small, { scene: 'plain', seed: 5 });
    small.label('GIF', 'NOT A SUPPORTED TYPE');
    const tmp = join(refused, 'animation.tmp.jpg');
    writeFileSync(tmp, jpegFromPixels(small.data, 400, 300));
    convert(tmp, join(refused, 'animation.gif'), 'gif');
  }

  // 201 small photos for one new book: one more than the Free plan's 200.
  for (let i = 1; i <= 201; i++) {
    const c = new Canvas(480, 360);
    paintScene(c, { scene: 'plain', seed: 1000 + i });
    c.label(
      `PHOTO ${String(i).padStart(3, '0')} OF 201`,
      i === 201 ? 'ONE TOO MANY ON FREE' : 'PLAN LIMIT TEST',
    );
    const day = 14 + Math.floor((i - 1) / 30);
    const minutes = 8 * 60 + ((i - 1) % 30) * 20;
    const time = `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
    writeFileSync(
      join(limit, `LIMIT_${String(i).padStart(3, '0')}.jpg`),
      jpegFromPixels(
        c.data,
        480,
        360,
        phone(`2026-11-${day}`, time, [26.92 + i * 0.0001, 75.82]),
        80,
      ),
    );
  }

  writeFileSync(join(root, 'HOW-TO-TEST.md'), guide(written));
  return { trip: written.length, canConvert };
}

function guide(files: string[]): string {
  const rows = TRIP_PHOTOS.map((p, i) => `| \`${files[i]}\` | ${p.expect} |`).join('\n');
  return `# Testing the Digital Travel Book by hand

Every photo here is generated, and shows on its face what it is testing.
Go through the steps in order; each says what you should see.

## 0. Before you start

- Run the app (\`npm run dev:db\`, \`npm run dev:api\`, \`npm run dev:web\`) and open http://localhost:5173.
- Register a **new** account for this test (any email, e.g. \`tester@example.com\`).

## 1. Create the book

New book, with exactly:

| Field | Value |
|---|---|
| Title | ${TRIP.title} |
| Start date | ${TRIP.startDate} |
| End date | ${TRIP.endDate} |
| Time zone | ${TRIP.timeZone} |
| Destinations | ${TRIP.destinations} |

## 2. Upload the trip

On the book page, drop in **everything in \`1-trip-photos\`** (${files.length} files) at once.

- All should end "Added". The page groups them into days.
- "Sort photos" shows a badge: the photos needing a decision.

What each photo should do:

| File | Expected |
|---|---|
${rows}

## 3. Sort

Open **Sort photos**.

- The tray holds the screenshot, the WhatsApp copy, the edited photo, the location-only photo and the Goa photo, each with its reason.
- "Check these" holds the London GPS glitch: press **Remove location**.
- Move the screenshot to Day 1 (click it, then "Move here" on Day 1). Try **Undo**, then do it again.
- Drag the location-only photo onto Day 6.
- Select the Goa photo and press **Exclude**.
- The WhatsApp copy and the edited photo: put them on any day you like.
- When the tray is empty you should see **Everything is sorted**.

## 4. Write

Open **Write captions & diary**.

- Expect about 5 chapters: Delhi (the night before), Jaipur, Jodhpur, Jaisalmer, Udaipur.
- Give each chapter a name. Try **Start a new chapter here** on a day, then **Join with the chapter before**.
- Day 5 (18 Nov) has no photos: write a diary entry for it ("Rest day…"). It should still appear in the book.
- Write a diary for Day 1 and captions for a few photos. Watch them save ("Saved").
- On a day with several photos, use the arrows to change their order and pick a layout.

## 5. Style, cover and reading

- On the book page, try each **Book style**; end on Comic Adventure.
- Make the Jal Mahal sunset the cover (**Use as cover** on its photo).
- **Open book**: check the cover, the trip map (all chapters, in order), each chapter's map (numbered places, dotted lines), the diary pages, the captions, the rest day, and that:
  - the Canon photo, the 0,0 breakfast photo and the London photo have **no pin**;
  - the Hawa Mahal shows up as **two** visits;
  - the 00:40 photo is on **Day 3**;
  - the tall dune photo is not stretched.
- Turn pages with the arrows, by tapping, and by dragging a page corner. Try the contents menu and full screen (F).

## 6. Duplicates

Upload \`2-upload-again-duplicates\` to the same book. Both should say **Already in this book**, even with new names.

## 7. Files that must be refused

Upload everything in \`3-should-be-refused\`:

| File | Expected |
|---|---|
| \`huge_photo_over_10MB.jpg\` | "Larger than 10 MB" |
| \`empty_file.jpg\` | "The file is empty" |
| \`notes.txt\` | "Not a supported photo" |
| \`animation.gif\` | "Not a supported photo" |
| \`not_really_a_photo.jpg\` | Passes the browser's check (it is named .jpg), then fails: "This file is not a supported photo". The server checks real contents, not names |

## 8. The plan limit

Create a **second** book with the same dates (14–20 Nov 2026) and upload all 201 photos in \`4-photo-limit-201-photos\`.

- 200 are added; the last batch is refused: "On the Free plan a book holds up to 200 photos".
- **Account** (click your name): plan Free, your usage, and the fullest book at 200 of 200.
- **Plans**: Free is marked as your plan, Pro as coming soon.

## 9. Account

- Change your name; change your password (you stay logged in).
- Switch light and dark mode (the sun/moon button).
- Finally, **Delete account** with your password: everything goes, and you are logged out.
`;
}
