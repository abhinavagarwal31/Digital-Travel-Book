import mongoose from 'mongoose';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../../app.ts';
import { loggedInAgent, startTestDatabase, TEST_CONFIG } from '../../test/helpers.ts';
import { UserModel } from '../auth/user.model.ts';
import { BookModel } from '../books/book.model.ts';
import { PhotoModel, type PhotoFields } from '../photos/photo.model.ts';

const app = createApp(TEST_CONFIG);
type Agent = Awaited<ReturnType<typeof loggedInAgent>>;

const TOKYO = { lat: 35.6595, lng: 139.7005 };
const KYOTO = { lat: 35.0116, lng: 135.7681 };
const KYOTO_NEARBY = { lat: 35.0121, lng: 135.7689 };
const OSAKA = { lat: 34.6687, lng: 135.5013 };
const PARIS = { lat: 48.8566, lng: 2.3522 };

let stopDatabase: () => Promise<void>;
beforeAll(async () => {
  stopDatabase = await startTestDatabase();
});
afterAll(() => stopDatabase());

let asha: Agent;
let userId: string;
let bookId: string;
let seq = 0;

beforeEach(async () => {
  await Promise.all([
    UserModel.deleteMany({}),
    BookModel.deleteMany({}),
    PhotoModel.deleteMany({}),
  ]);
  asha = await loggedInAgent(app, 'asha@example.com');
  userId = (await asha.get('/api/auth/me')).body.user.id;
  bookId = (
    await asha.post('/api/books').send({
      title: 'Japan',
      startDate: '2026-10-10',
      endDate: '2026-10-15',
      defaultTz: 'Asia/Tokyo',
    })
  ).body.book.id;
});

/** A ready photo as the upload pipeline would have stored it (Japan, UTC+9). */
async function addPhoto(
  local: string | null,
  gps: { lat: number; lng: number } | null,
  extra: Partial<PhotoFields> = {},
  owner = { userId, bookId },
) {
  const n = seq++;
  const doc = await PhotoModel.create({
    userId: owner.userId,
    bookId: owner.bookId,
    originalFilename: `IMG_${n}.JPG`,
    mime: 'image/jpeg',
    bytes: 1000,
    contentHash: `hash-${n}`,
    storage: { publicId: `p/${n}`, version: 1 },
    status: 'ready',
    exif: {
      ...(local ? { localDateTime: local, offset: '+09:00' } : {}),
      ...(gps ? { lat: gps.lat, lng: gps.lng } : {}),
    },
    capturedAt: local ? new Date(`${local}+09:00`) : null,
    localDateTime: local,
    timeSource: local ? 'exif-offset' : null,
    gps,
    gpsStatus: gps ? 'exif' : null,
    dayDate: local ? local.slice(0, 10) : null,
    flags: local ? [] : ['no_time'],
    ...extra,
  });
  return doc.id as string;
}

const photo = (id: string) => PhotoModel.findById(id).lean();
const organizeBook = () => asha.post(`/api/books/${bookId}/organize`).send({});

describe('POST /books/:id/organize', () => {
  it('suggests chapters by area, flags a stray GPS fix and reports what is left to sort', async () => {
    await addPhoto('2026-10-10T10:00:00', TOKYO);
    await addPhoto('2026-10-12T09:00:00', KYOTO);
    const stray = await addPhoto('2026-10-12T09:10:00', PARIS);
    await addPhoto('2026-10-12T09:20:00', KYOTO_NEARBY);
    await addPhoto(null, null);

    const res = await organizeBook();
    expect(res.status).toBe(200);
    expect(res.body.book.chapters.map((c: { dayDates: string[] }) => c.dayDates)).toEqual([
      ['2026-10-10'],
      ['2026-10-12'],
    ]);
    expect(res.body.book.chaptersEdited).toBe(false);
    expect((await photo(stray))?.flags).toEqual(['gps_outlier']);
    expect(res.body.summary).toEqual({
      ready: 5,
      inBook: 4,
      toSort: 1,
      toCheck: 1,
      excluded: 0,
      complete: false,
    });
  });
});

describe('moving photos between days', () => {
  it('records a user decision that organisation never undoes', async () => {
    const id = await addPhoto('2026-10-12T10:00:00', KYOTO);
    const res = await asha
      .put(`/api/books/${bookId}/photos/day`)
      .send({ photoIds: [id], dayDate: '2026-10-14' });
    expect(res.status).toBe(200);
    expect(await photo(id)).toMatchObject({ dayDate: '2026-10-14', assignedBy: 'user' });

    await organizeBook();
    expect((await photo(id))?.dayDate).toBe('2026-10-14');
  });

  it('can deliberately leave a photo unsorted, and keeps it that way', async () => {
    const id = await addPhoto('2026-10-12T10:00:00', KYOTO);
    await asha.put(`/api/books/${bookId}/photos/day`).send({ photoIds: [id], dayDate: null });
    const res = await organizeBook();
    expect(await photo(id)).toMatchObject({ dayDate: null, assignedBy: 'user' });
    expect(res.body.summary.toSort).toBe(1);
  });

  it('hands a photo back to automatic placement', async () => {
    const id = await addPhoto('2026-10-12T10:00:00', KYOTO);
    await asha
      .put(`/api/books/${bookId}/photos/day`)
      .send({ photoIds: [id], dayDate: '2026-10-14' });
    const res = await asha.post(`/api/books/${bookId}/photos/day-reset`).send({ photoIds: [id] });
    expect(res.status).toBe(200);
    expect(await photo(id)).toMatchObject({ dayDate: '2026-10-12', assignedBy: 'auto' });
  });

  it('refuses a day that is not part of the trip', async () => {
    const id = await addPhoto('2026-10-12T10:00:00', KYOTO);
    const res = await asha
      .put(`/api/books/${bookId}/photos/day`)
      .send({ photoIds: [id], dayDate: '2027-01-01' });
    expect(res.status).toBe(400);
    expect((await photo(id))?.dayDate).toBe('2026-10-12');
  });

  it('is all-or-nothing: one foreign id rejects the whole move', async () => {
    const mine = await addPhoto('2026-10-12T10:00:00', KYOTO);
    const ben = await loggedInAgent(app, 'ben@example.com');
    const benId = (await ben.get('/api/auth/me')).body.user.id;
    const benBook = (
      await ben.post('/api/books').send({
        title: 'Ben',
        startDate: '2026-10-10',
        endDate: '2026-10-15',
        defaultTz: 'UTC',
      })
    ).body.book.id;
    const theirs = await addPhoto(
      '2026-10-12T11:00:00',
      KYOTO,
      {},
      { userId: benId, bookId: benBook },
    );

    const res = await asha
      .put(`/api/books/${bookId}/photos/day`)
      .send({ photoIds: [mine, theirs], dayDate: '2026-10-14' });
    expect(res.status).toBe(404);
    expect((await photo(mine))?.dayDate).toBe('2026-10-12');
    expect((await photo(theirs))?.dayDate).toBe('2026-10-12');
  });

  it('refuses an undo whose expected state is out of date, changing nothing', async () => {
    const id = await addPhoto('2026-10-12T10:00:00', KYOTO);
    // Another tab moved it to the 14th after this client last looked.
    await asha
      .put(`/api/books/${bookId}/photos/day`)
      .send({ photoIds: [id], dayDate: '2026-10-14' });

    const stale = await asha.put(`/api/books/${bookId}/photos/day`).send({
      photoIds: [id],
      dayDate: '2026-10-11',
      expect: { [id]: { dayDate: '2026-10-12', assignedBy: 'auto' } },
    });
    expect(stale.status).toBe(409);
    expect(stale.body.error).toMatchObject({ code: 'CONFLICT', details: { photoIds: [id] } });
    expect((await photo(id))?.dayDate).toBe('2026-10-14');

    const fresh = await asha.put(`/api/books/${bookId}/photos/day`).send({
      photoIds: [id],
      dayDate: '2026-10-11',
      expect: { [id]: { dayDate: '2026-10-14', assignedBy: 'user' } },
    });
    expect(fresh.status).toBe(200);
  });
});

describe('excluding photos', () => {
  it('takes photos out of the book and the counts, and brings them back', async () => {
    const id = await addPhoto(null, null);
    const hidden = await asha
      .put(`/api/books/${bookId}/photos/visibility`)
      .send({ photoIds: [id], hidden: true });
    expect(hidden.body.summary).toMatchObject({ toSort: 0, excluded: 1, complete: true });

    const shown = await asha
      .put(`/api/books/${bookId}/photos/visibility`)
      .send({ photoIds: [id], hidden: false });
    expect(shown.body.summary).toMatchObject({ toSort: 1, excluded: 0, complete: false });
  });
});

describe('correcting a location', () => {
  async function strayPhoto() {
    await addPhoto('2026-10-12T09:00:00', KYOTO);
    const stray = await addPhoto('2026-10-12T09:10:00', PARIS);
    await addPhoto('2026-10-12T09:20:00', KYOTO_NEARBY);
    await organizeBook();
    return stray;
  }

  it('confirming a flagged location clears the check for good', async () => {
    const stray = await strayPhoto();
    const res = await asha.put(`/api/photos/${stray}/location`).send({ action: 'confirm' });
    expect(res.body.summary.toCheck).toBe(0);
    await organizeBook();
    expect(await photo(stray)).toMatchObject({ gpsStatus: 'confirmed', flags: [] });
  });

  it('removing it keeps the raw EXIF, and reset restores it', async () => {
    const stray = await strayPhoto();
    await asha.put(`/api/photos/${stray}/location`).send({ action: 'remove' });
    expect(await photo(stray)).toMatchObject({
      gps: null,
      gpsStatus: 'removed',
      exif: { lat: PARIS.lat, lng: PARIS.lng },
    });

    await asha.put(`/api/photos/${stray}/location`).send({ action: 'reset' });
    expect(await photo(stray)).toMatchObject({ gps: PARIS, gpsStatus: 'exif' });
  });

  it('refuses to confirm a location that does not exist', async () => {
    const id = await addPhoto('2026-10-12T09:00:00', null);
    const res = await asha.put(`/api/photos/${id}/location`).send({ action: 'confirm' });
    expect(res.status).toBe(400);
  });
});

describe('correcting a time', () => {
  it('moves the photo to the day of its new time, and reset restores the file’s time', async () => {
    const id = await addPhoto('2026-10-12T09:00:00', KYOTO);
    await asha
      .put(`/api/books/${bookId}/photos/day`)
      .send({ photoIds: [id], dayDate: '2026-10-14' });

    const set = await asha
      .put(`/api/photos/${id}/time`)
      .send({ localDateTime: '2026-10-13T08:30:00', timeZone: 'Asia/Tokyo' });
    expect(set.status).toBe(200);
    expect(await photo(id)).toMatchObject({
      localDateTime: '2026-10-13T08:30:00',
      timeSource: 'user',
      dayDate: '2026-10-13',
      assignedBy: 'auto',
      exif: { localDateTime: '2026-10-12T09:00:00' }, // raw EXIF untouched
    });
    expect((await photo(id))?.capturedAt?.toISOString()).toBe('2026-10-12T23:30:00.000Z');

    await asha.put(`/api/photos/${id}/time`).send({ reset: true });
    expect(await photo(id)).toMatchObject({
      localDateTime: '2026-10-12T09:00:00',
      timeSource: 'exif-offset',
      dayDate: '2026-10-12',
    });
  });

  it('gives an undated photo a day once the user sets its time', async () => {
    const id = await addPhoto(null, null);
    await asha
      .put(`/api/photos/${id}/time`)
      .send({ localDateTime: '2026-10-11T12:00:00', timeZone: 'Asia/Tokyo' });
    expect(await photo(id)).toMatchObject({ dayDate: '2026-10-11', flags: [] });
  });
});

describe('editing chapters', () => {
  it('saves the user’s chapters, then only places new days next to their neighbours', async () => {
    await addPhoto('2026-10-10T10:00:00', TOKYO);
    await addPhoto('2026-10-12T10:00:00', KYOTO);
    await organizeBook();

    const saved = await asha.put(`/api/books/${bookId}/chapters`).send({
      chapters: [{ id: 'whole-trip', title: 'Everything', dayDates: ['2026-10-10', '2026-10-12'] }],
    });
    expect(saved.status).toBe(200);
    expect(saved.body.book.chaptersEdited).toBe(true);

    await addPhoto('2026-10-14T10:00:00', OSAKA); // far away, would be its own suggested chapter
    const res = await organizeBook();
    expect(res.body.book.chapters).toEqual([
      {
        id: 'whole-trip',
        title: 'Everything',
        dayDates: ['2026-10-10', '2026-10-12', '2026-10-14'],
      },
    ]);
  });

  it('refuses a day in two chapters, or a day outside the trip', async () => {
    const twice = await asha.put(`/api/books/${bookId}/chapters`).send({
      chapters: [
        { id: 'a', title: 'A', dayDates: ['2026-10-10'] },
        { id: 'b', title: 'B', dayDates: ['2026-10-10'] },
      ],
    });
    expect(twice.status).toBe(400);
    const outside = await asha.put(`/api/books/${bookId}/chapters`).send({
      chapters: [{ id: 'a', title: 'A', dayDates: ['2027-05-05'] }],
    });
    expect(outside.status).toBe(400);
  });
});

describe('changing the trip dates (audit B2)', () => {
  it('moves automatic photos with the dates but never user decisions, diaries or chapters', async () => {
    const auto = await addPhoto('2026-10-14T10:00:00', OSAKA);
    const placed = await addPhoto('2026-10-14T11:00:00', OSAKA);
    await asha
      .put(`/api/books/${bookId}/photos/day`)
      .send({ photoIds: [placed], dayDate: '2026-10-14' });
    await BookModel.updateOne(
      { _id: bookId },
      { $set: { days: [{ date: '2026-10-15', diary: 'Last day.' }] } },
    );

    const shrunk = await asha.patch(`/api/books/${bookId}`).send({ endDate: '2026-10-12' });
    expect(shrunk.status).toBe(200);
    expect(await photo(auto)).toMatchObject({ dayDate: null, flags: ['outside_trip'] });
    expect(await photo(placed)).toMatchObject({ dayDate: '2026-10-14', assignedBy: 'user' });
    expect(shrunk.body.book.days).toEqual([{ date: '2026-10-15', diary: 'Last day.' }]);
    expect(shrunk.body.book.chapters.flatMap((c: { dayDates: string[] }) => c.dayDates)).toEqual(
      expect.arrayContaining(['2026-10-14', '2026-10-15']),
    );

    await asha.patch(`/api/books/${bookId}`).send({ endDate: '2026-10-15' });
    expect(await photo(auto)).toMatchObject({ dayDate: '2026-10-14', flags: [] });
  });
});

describe('C5: re-organising never undoes user edits', () => {
  it('keeps every decision across new uploads and a re-run', async () => {
    const t1 = await addPhoto('2026-10-10T10:00:00', TOKYO);
    const k1 = await addPhoto('2026-10-12T09:00:00', KYOTO);
    const k2 = await addPhoto('2026-10-12T09:30:00', KYOTO_NEARBY);
    const junk = await addPhoto(null, null, { originalFilename: 'Screenshot.png' });
    await organizeBook();

    // The user: moves k2 to the 13th, leaves k1 unsorted on purpose, excludes the screenshot,
    // renames and merges chapters, captions a photo and writes a diary on a photo-less day.
    await asha
      .put(`/api/books/${bookId}/photos/day`)
      .send({ photoIds: [k2], dayDate: '2026-10-13' });
    await asha.put(`/api/books/${bookId}/photos/day`).send({ photoIds: [k1], dayDate: null });
    await asha
      .put(`/api/books/${bookId}/photos/visibility`)
      .send({ photoIds: [junk], hidden: true });
    await asha.put(`/api/books/${bookId}/chapters`).send({
      chapters: [
        { id: 'japan', title: 'Japan, all of it', dayDates: ['2026-10-10', '2026-10-13'] },
      ],
    });
    await PhotoModel.updateOne({ _id: t1 }, { $set: { caption: 'First ramen' } });
    await BookModel.updateOne(
      { _id: bookId },
      { $set: { days: [{ date: '2026-10-11', diary: 'Rest day.' }] } },
    );

    // New photos arrive, one on a brand-new day, and organisation runs again.
    const o1 = await addPhoto('2026-10-15T10:00:00', OSAKA);
    const res = await organizeBook();

    expect(await photo(k2)).toMatchObject({ dayDate: '2026-10-13', assignedBy: 'user' });
    expect(await photo(k1)).toMatchObject({ dayDate: null, assignedBy: 'user' });
    expect(await photo(junk)).toMatchObject({ hidden: true });
    expect(await photo(t1)).toMatchObject({ caption: 'First ramen', dayDate: '2026-10-10' });
    expect(await photo(o1)).toMatchObject({ dayDate: '2026-10-15', assignedBy: 'auto' });

    const book = res.body.book;
    expect(book.days).toEqual([{ date: '2026-10-11', diary: 'Rest day.' }]);
    expect(book.chapters).toEqual([
      {
        id: 'japan',
        title: 'Japan, all of it',
        // Diary day and the new day were placed; nothing lost, nothing twice.
        dayDates: ['2026-10-10', '2026-10-11', '2026-10-13', '2026-10-15'],
      },
    ]);
    const all = book.chapters.flatMap((c: { dayDates: string[] }) => c.dayDates);
    expect(new Set(all).size).toBe(all.length);
    expect(res.body.summary).toMatchObject({ toSort: 1, excluded: 1 });
  });
});

describe('ownership', () => {
  it('denies another user every organisation route', async () => {
    const id = await addPhoto('2026-10-12T10:00:00', KYOTO);
    const ben = await loggedInAgent(app, 'ben@example.com');
    const attempts = [
      ben.post(`/api/books/${bookId}/organize`).send({}),
      ben.put(`/api/books/${bookId}/photos/day`).send({ photoIds: [id], dayDate: null }),
      ben.post(`/api/books/${bookId}/photos/day-reset`).send({ photoIds: [id] }),
      ben.put(`/api/books/${bookId}/photos/visibility`).send({ photoIds: [id], hidden: true }),
      ben.put(`/api/photos/${id}/location`).send({ action: 'remove' }),
      ben.put(`/api/photos/${id}/time`).send({ reset: true }),
      ben.put(`/api/books/${bookId}/chapters`).send({ chapters: [] }),
    ];
    for (const res of await Promise.all(attempts)) expect(res.status).toBe(404);
    expect(await photo(id)).toMatchObject({ dayDate: '2026-10-12', hidden: false, gps: KYOTO });
  });

  it('requires login', async () => {
    const res = await request(app).post(`/api/books/${bookId}/organize`).send({});
    expect(res.status).toBe(401);
    expect(mongoose.isValidObjectId(bookId)).toBe(true);
  });
});
