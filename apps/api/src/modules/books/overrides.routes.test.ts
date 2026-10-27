import mongoose from 'mongoose';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../../app.ts';
import { loggedInAgent, startTestDatabase, TEST_CONFIG } from '../../test/helpers.ts';
import { UserModel } from '../auth/user.model.ts';
import { PhotoModel } from '../photos/photo.model.ts';
import { BookModel } from './book.model.ts';

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

const JAPAN = {
  title: 'Japan',
  startDate: '2026-10-10',
  endDate: '2026-10-15',
  defaultTz: 'Asia/Tokyo',
};

beforeEach(async () => {
  await Promise.all([
    UserModel.deleteMany({}),
    BookModel.deleteMany({}),
    PhotoModel.deleteMany({}),
  ]);
  asha = await loggedInAgent(app, 'asha@example.com');
  ben = await loggedInAgent(app, 'ben@example.com');
  userId = (await asha.get('/api/auth/me')).body.user.id;
  bookId = (await asha.post('/api/books').send(JAPAN)).body.book.id;
});

async function addPhoto(
  dayDate: string,
  status: 'ready' | 'pending' = 'ready',
  inBook: string = bookId,
) {
  const n = seq++;
  const local = `${dayDate}T10:00:00`;
  const doc = await PhotoModel.create({
    userId,
    bookId: inBook,
    originalFilename: `IMG_${n}.JPG`,
    mime: 'image/jpeg',
    bytes: 1000,
    contentHash: `hash-${n}`,
    storage: { publicId: `p/${n}`, version: 1 },
    status,
    exif: { localDateTime: local, offset: '+09:00' },
    capturedAt: new Date(`${local}+09:00`),
    localDateTime: local,
    timeSource: 'exif-offset',
    dayDate,
    flags: [],
  });
  return doc.id as string;
}

const cover = (photoId: string | null, agent: Agent = asha) =>
  agent.put(`/api/books/${bookId}/cover`).send({ photoId });
const layout = (date: string, value: string | null, agent: Agent = asha) =>
  agent.put(`/api/books/${bookId}/day-layouts/${date}`).send({ layout: value });

describe('PUT /books/:id/cover', () => {
  it('sets a photo of the book as the cover, and clears it again', async () => {
    const photoId = await addPhoto('2026-10-11');
    const res = await cover(photoId);
    expect(res.status).toBe(200);
    expect(res.body.book.overrides).toEqual({
      coverPhotoId: photoId,
      dayLayouts: [],
      photoOrder: [],
    });

    expect((await cover(null)).body.book.overrides.coverPhotoId).toBeNull();
  });

  it("refuses another book's photo, another user's, and one still uploading", async () => {
    const otherBook = (await asha.post('/api/books').send(JAPAN)).body.book.id;
    const elsewhere = await addPhoto('2026-10-11', 'ready', otherBook);
    const pending = await addPhoto('2026-10-11', 'pending');
    const missing = new mongoose.Types.ObjectId().toString();
    for (const id of [elsewhere, pending, missing]) {
      expect((await cover(id)).status).toBe(404);
    }
    const bens = (await ben.post('/api/books').send(JAPAN)).body.book.id;
    expect((await cover(await addPhoto('2026-10-11', 'ready', bens))).status).toBe(404);
    expect((await BookModel.findById(bookId))?.overrides.coverPhotoId).toBeNull();
  });

  it('accepts only an id or null', async () => {
    for (const body of [{ photoId: 'not-an-id' }, {}, { photoId: null, extra: 1 }]) {
      const res = await asha.put(`/api/books/${bookId}/cover`).send(body);
      expect(res.status).toBe(400);
    }
  });

  it('stops being the cover when the photo is deleted', async () => {
    const photoId = await addPhoto('2026-10-11');
    await cover(photoId);
    expect((await asha.delete(`/api/photos/${photoId}`)).status).toBe(204);
    expect((await asha.get(`/api/books/${bookId}`)).body.book.overrides.coverPhotoId).toBeNull();
  });
});

describe('PUT /books/:id/day-layouts/:date', () => {
  it('sets, replaces and clears one day’s layout, keeping days in order', async () => {
    await layout('2026-10-12', 'hero-1');
    await layout('2026-10-10', 'split-2');
    const res = await layout('2026-10-12', 'grid-4');
    expect(res.status).toBe(200);
    expect(res.body.book.overrides.dayLayouts).toEqual([
      { date: '2026-10-10', layout: 'split-2' },
      { date: '2026-10-12', layout: 'grid-4' },
    ]);
    const cleared = await layout('2026-10-12', null);
    expect(cleared.body.book.overrides.dayLayouts).toEqual([
      { date: '2026-10-10', layout: 'split-2' },
    ]);
  });

  it("accepts only the book's days and known layouts", async () => {
    expect((await layout('2026-11-30', 'hero-1')).status).toBe(400);
    expect((await layout('not-a-date', 'hero-1')).status).toBe(404);
    expect((await layout('2026-10-11', 'collage-9')).status).toBe(400);
    // A photo's own day outside the trip range is still one of the book's days.
    await addPhoto('2026-10-17');
    expect((await layout('2026-10-17', 'hero-1')).status).toBe(200);
  });

  it('works on a book saved before layouts existed', async () => {
    await BookModel.collection.updateOne(
      { _id: new mongoose.Types.ObjectId(bookId) },
      { $unset: { overrides: 1 } },
    );
    const res = await layout('2026-10-11', 'mosaic-3');
    expect(res.status).toBe(200);
    expect(res.body.book.overrides).toEqual({
      coverPhotoId: null,
      dayLayouts: [{ date: '2026-10-11', layout: 'mosaic-3' }],
      photoOrder: [],
    });
  });

  it('two saves for the same day at once leave one choice', async () => {
    await Promise.all([layout('2026-10-11', 'hero-1'), layout('2026-10-11', 'split-2')]);
    const stored = (await BookModel.findById(bookId))?.overrides.dayLayouts ?? [];
    expect(stored.filter((d) => d.date === '2026-10-11')).toHaveLength(1);
  });
});

describe('PUT /books/:id/days/:date/photo-order', () => {
  const order = (date: string, photoIds: string[], agent: Agent = asha) =>
    agent.put(`/api/books/${bookId}/days/${date}/photo-order`).send({ photoIds });

  it("saves and replaces a day's order", async () => {
    const a = await addPhoto('2026-10-11');
    const b = await addPhoto('2026-10-11');
    expect((await order('2026-10-11', [b, a])).body.book.overrides.photoOrder).toEqual([
      { date: '2026-10-11', photoIds: [b, a] },
    ]);
    expect((await order('2026-10-11', [a])).body.book.overrides.photoOrder).toEqual([
      { date: '2026-10-11', photoIds: [a] },
    ]);
  });

  it('accepts only finished photos of this book on that day, all or nothing', async () => {
    const a = await addPhoto('2026-10-11');
    const otherDay = await addPhoto('2026-10-12');
    const pending = await addPhoto('2026-10-11', 'pending');
    const otherBook = (await asha.post('/api/books').send(JAPAN)).body.book.id;
    const elsewhere = await addPhoto('2026-10-11', 'ready', otherBook);
    for (const ids of [
      [a, otherDay],
      [a, pending],
      [a, elsewhere],
    ]) {
      expect((await order('2026-10-11', ids)).status).toBe(404);
    }
    expect((await order('2026-10-11', [a, a])).status).toBe(400);
    expect((await order('2026-10-11', [])).status).toBe(400);
    expect((await order('2026-11-30', [a])).status).toBe(400);
    expect((await BookModel.findById(bookId))?.overrides.photoOrder).toHaveLength(0);
  });

  it("refuses another user's book", async () => {
    const a = await addPhoto('2026-10-11');
    expect((await order('2026-10-11', [a], ben)).status).toBe(404);
  });
});

describe('another user and logged-out visitors', () => {
  it('get 404 and change nothing', async () => {
    const photoId = await addPhoto('2026-10-11');
    expect((await cover(photoId, ben)).status).toBe(404);
    expect((await layout('2026-10-11', 'hero-1', ben)).status).toBe(404);
    const stored = await BookModel.findById(bookId);
    expect(stored?.overrides.coverPhotoId).toBeNull();
    expect(stored?.overrides.dayLayouts).toHaveLength(0);
  });

  it('get 401', async () => {
    const res = await request(app).put(`/api/books/${bookId}/cover`).send({ photoId: null });
    expect(res.status).toBe(401);
    const res2 = await request(app)
      .put(`/api/books/${bookId}/day-layouts/2026-10-11`)
      .send({ layout: 'hero-1' });
    expect(res2.status).toBe(401);
  });
});
