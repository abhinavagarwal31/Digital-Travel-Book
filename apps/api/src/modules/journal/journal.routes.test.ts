import mongoose from 'mongoose';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../../app.ts';
import { loggedInAgent, startTestDatabase, TEST_CONFIG } from '../../test/helpers.ts';
import { UserModel } from '../auth/user.model.ts';
import { BookModel } from '../books/book.model.ts';
import { PhotoModel } from '../photos/photo.model.ts';

const app = createApp(TEST_CONFIG);
type Agent = Awaited<ReturnType<typeof loggedInAgent>>;

let stopDatabase: () => Promise<void>;
beforeAll(async () => {
  stopDatabase = await startTestDatabase();
});
afterAll(() => stopDatabase());

let asha: Agent;
let ben: Agent;
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
  ben = await loggedInAgent(app, 'ben@example.com');
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

async function addPhoto(dayDate: string | null, status: 'ready' | 'pending' = 'ready') {
  const n = seq++;
  const local = dayDate ? `${dayDate}T10:00:00` : null;
  const doc = await PhotoModel.create({
    userId,
    bookId,
    originalFilename: `IMG_${n}.JPG`,
    mime: 'image/jpeg',
    bytes: 1000,
    contentHash: `hash-${n}`,
    storage: { publicId: `p/${n}`, version: 1 },
    status,
    exif: local ? { localDateTime: local, offset: '+09:00', lat: 35.66, lng: 139.7 } : {},
    capturedAt: local ? new Date(`${local}+09:00`) : null,
    localDateTime: local,
    timeSource: local ? 'exif-offset' : null,
    gps: local ? { lat: 35.66, lng: 139.7 } : null,
    gpsStatus: local ? 'exif' : null,
    dayDate,
    flags: local ? [] : ['no_time'],
  });
  return doc.id as string;
}

const diary = (date: string, text: string, agent: Agent = asha) =>
  agent.put(`/api/books/${bookId}/days/${date}/diary`).send({ diary: text });
const storedDays = async () => (await BookModel.findById(bookId).lean())?.days;

describe('PUT /photos/:id/caption', () => {
  it('saves a trimmed caption and returns the photo', async () => {
    const id = await addPhoto('2026-10-10');
    const res = await asha.put(`/api/photos/${id}/caption`).send({ caption: '  Shibuya at dusk ' });
    expect(res.status).toBe(200);
    expect(res.body.photo).toMatchObject({ id, caption: 'Shibuya at dusk' });

    const cleared = await asha.put(`/api/photos/${id}/caption`).send({ caption: '' });
    expect(cleared.body.photo.caption).toBe('');
  });

  it('refuses an overlong caption and changes nothing', async () => {
    const id = await addPhoto('2026-10-10');
    const res = await asha.put(`/api/photos/${id}/caption`).send({ caption: 'x'.repeat(301) });
    expect(res.status).toBe(400);
    expect(res.body.error.details[0].path).toBe('caption');
    expect((await PhotoModel.findById(id).lean())?.caption).toBe('');
  });

  it("answers 404 for another user's photo and for one still uploading", async () => {
    const id = await addPhoto('2026-10-10');
    const pending = await addPhoto(null, 'pending');
    expect((await ben.put(`/api/photos/${id}/caption`).send({ caption: 'Mine now' })).status).toBe(
      404,
    );
    expect((await asha.put(`/api/photos/${pending}/caption`).send({ caption: 'Hi' })).status).toBe(
      404,
    );
    expect((await PhotoModel.findById(id).lean())?.caption).toBe('');
  });
});

describe('PUT /books/:id/days/:date/diary', () => {
  it('adds an entry, updates it in place and removes it when emptied', async () => {
    const first = await diary('2026-10-12', 'Fushimi Inari at dawn.');
    expect(first.status).toBe(200);
    expect(first.body.book.days).toEqual([{ date: '2026-10-12', diary: 'Fushimi Inari at dawn.' }]);

    await diary('2026-10-10', 'Landed.');
    const second = await diary('2026-10-12', 'Fushimi Inari at dawn, then tofu.');
    expect(second.body.book.days).toEqual([
      { date: '2026-10-10', diary: 'Landed.' },
      { date: '2026-10-12', diary: 'Fushimi Inari at dawn, then tofu.' },
    ]);

    const removed = await diary('2026-10-12', '   ');
    expect(removed.body.book.days).toEqual([{ date: '2026-10-10', diary: 'Landed.' }]);
  });

  it('works on a book saved before diaries existed (no days array at all)', async () => {
    await BookModel.collection.updateOne(
      { _id: new mongoose.Types.ObjectId(bookId) },
      { $unset: { days: '' } },
    );
    const res = await diary('2026-10-10', 'Landed.');
    expect(res.status).toBe(200);
    expect(res.body.book.days).toEqual([{ date: '2026-10-10', diary: 'Landed.' }]);
  });

  it('never stores the same day twice, even when saves race', async () => {
    await Promise.all([
      diary('2026-10-11', 'one'),
      diary('2026-10-11', 'two'),
      diary('2026-10-11', 'three'),
    ]);
    const days = await storedDays();
    expect(days).toHaveLength(1);
    expect(['one', 'two', 'three']).toContain(days?.[0]?.diary);
  });

  it('accepts only the book’s days: the trip, plus days with photos', async () => {
    const outside = await diary('2026-11-01', 'Somewhere else');
    expect(outside.status).toBe(400);
    expect(outside.body.error.details).toEqual([
      { path: 'date', message: 'Not one of the book’s days' },
    ]);

    await addPhoto('2026-10-17');
    expect((await diary('2026-10-17', 'An extra day in Osaka')).status).toBe(200);
    expect((await diary('2026-13-01', 'nope')).status).toBe(404);
    expect(await storedDays()).toEqual([{ date: '2026-10-17', diary: 'An extra day in Osaka' }]);
  });

  it('puts a day that only has a diary entry into a chapter', async () => {
    await addPhoto('2026-10-10');
    const organized = await asha.post(`/api/books/${bookId}/organize`).send({});
    expect(organized.body.book.chapters.flatMap((c: { dayDates: string[] }) => c.dayDates)).toEqual(
      ['2026-10-10'],
    );

    const res = await diary('2026-10-12', 'Rest day, wrote postcards.');
    expect(res.body.book.chapters.flatMap((c: { dayDates: string[] }) => c.dayDates)).toEqual([
      '2026-10-10',
      '2026-10-12',
    ]);
  });

  it("answers 404 for another user's book and leaves it unchanged", async () => {
    await diary('2026-10-10', 'Mine');
    const res = await diary('2026-10-10', 'Overwritten', ben);
    expect(res.status).toBe(404);
    expect(await storedDays()).toEqual([{ date: '2026-10-10', diary: 'Mine' }]);
  });

  it('stores text that looks like a database expression exactly as written', async () => {
    for (const text of ['$days', '$$ROOT', '{ "$literal": 1 }']) {
      const res = await diary('2026-10-10', text);
      expect(res.body.book.days).toEqual([{ date: '2026-10-10', diary: text }]);
    }
  });

  it('refuses an overlong entry', async () => {
    const res = await diary('2026-10-10', 'x'.repeat(5001));
    expect(res.status).toBe(400);
    expect(await storedDays()).toEqual([]);
  });
});

describe('authentication is required', () => {
  const id = new mongoose.Types.ObjectId().toString();
  it.each([
    [`/api/photos/${id}/caption`, { caption: 'x' }],
    [`/api/books/${id}/days/2026-10-10/diary`, { diary: 'x' }],
  ])('PUT %s answers 401 when logged out', async (path, body) => {
    const res = await request(app).put(path).send(body);
    expect(res.status).toBe(401);
  });
});
