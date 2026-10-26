import mongoose from 'mongoose';
import { createHash } from 'node:crypto';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../../app.ts';
import { FakeStorage } from '../../test/fakeStorage.ts';
import { loggedInAgent, startTestDatabase, TEST_CONFIG } from '../../test/helpers.ts';
import { makeJpeg } from '../../test/makeJpeg.ts';
import { UserModel } from '../auth/user.model.ts';
import { BookModel } from '../books/book.model.ts';
import { PhotoModel } from './photo.model.ts';
import { BOOK_DELETE_GRACE_MS, STALE_FAILED_MS, STALE_PENDING_MS, sweep } from './sweeper.ts';

const storage = new FakeStorage();
const app = createApp({ ...TEST_CONFIG, storage, storageNamespace: 'test' });
type Agent = Awaited<ReturnType<typeof loggedInAgent>>;

const sha256 = (bytes: Buffer) => createHash('sha256').update(bytes).digest('hex');
const PHOTO = makeJpeg({
  exif: { dateTimeOriginal: '2026:10:12 10:00:00', offsetTimeOriginal: '+09:00' },
});

let stopDatabase: () => Promise<void>;
beforeAll(async () => {
  stopDatabase = await startTestDatabase();
});
afterAll(() => stopDatabase());

let asha: Agent;
let bookId: string;
beforeEach(async () => {
  storage.heal();
  storage.assets.clear();
  await Promise.all([
    UserModel.deleteMany({}),
    BookModel.deleteMany({}),
    PhotoModel.deleteMany({}),
  ]);
  asha = await loggedInAgent(app, 'asha@example.com');
  bookId = (
    await asha.post('/api/books').send({
      title: 'Japan',
      startDate: '2026-10-10',
      endDate: '2026-10-15',
      defaultTz: 'Asia/Tokyo',
    })
  ).body.book.id;
});

async function announce(bytes: Buffer, agent = asha) {
  const file = {
    filename: 'a.jpg',
    mime: 'image/jpeg',
    bytes: bytes.length,
    clientHash: sha256(bytes),
  };
  return (await agent.post(`/api/books/${bookId}/uploads`).send({ files: [file] })).body.results[0];
}

async function upload(bytes = PHOTO, agent = asha): Promise<{ photoId: string; publicId: string }> {
  const intent = await announce(bytes, agent);
  const publicId = intent.upload.fields.public_id;
  const signed = storage.simulateUpload(publicId, bytes);
  const res = await agent.post(`/api/photos/${intent.photoId}/confirm`).send(signed);
  if (res.status !== 200) throw new Error(`confirm failed: ${res.status}`);
  return { photoId: intent.photoId, publicId };
}

/** Moves a document's updatedAt into the past, as if time had passed. */
async function age(model: typeof PhotoModel | typeof BookModel, id: string, ms: number) {
  await (model as typeof PhotoModel).updateOne(
    { _id: id },
    { $set: { updatedAt: new Date(Date.now() - ms) } },
    { timestamps: false },
  );
}

describe('GET /api/photos/:id/image/:variant', () => {
  it('streams the image to its owner with nothing cacheable or internal', async () => {
    const { photoId, publicId } = await upload();
    const res = await asha.get(`/api/photos/${photoId}/image/thumb`).buffer(true);

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toBe('image/webp');
    expect(res.headers['cache-control']).toBe('private, no-store');
    expect(res.headers['x-storage-internal']).toBeUndefined();
    expect(res.body.toString()).toBe(`variant:thumb:${publicId}`);
  });

  it('refuses a logged-out request', async () => {
    const { photoId } = await upload();
    expect((await request(app).get(`/api/photos/${photoId}/image/page`)).status).toBe(401);
  });

  it('refuses the old cookie after logout', async () => {
    const { photoId } = await upload();
    const cookie = (await asha.get('/api/auth/me')).request.cookies;
    await asha.post('/api/auth/logout').send({});
    expect((await asha.get(`/api/photos/${photoId}/image/page`)).status).toBe(401);
    expect(cookie).toBeDefined();
  });

  it("answers 404 for someone else's image", async () => {
    const { photoId } = await upload();
    const ben = await loggedInAgent(app, 'ben@example.com');
    const res = await ben.get(`/api/photos/${photoId}/image/thumb`);
    expect(res.status).toBe(404);
    expect(res.headers['content-type']).toMatch(/json/);
  });

  it('allows only the fixed variants', async () => {
    const { photoId } = await upload();
    for (const variant of ['original', 'w_5000', '__proto__', 'constructor']) {
      expect((await asha.get(`/api/photos/${photoId}/image/${variant}`)).status).toBe(404);
    }
  });

  it('does not serve a photo that is still uploading', async () => {
    const intent = await announce(PHOTO);
    expect((await asha.get(`/api/photos/${intent.photoId}/image/thumb`)).status).toBe(404);
  });

  it('answers 502 when storage is down', async () => {
    const { photoId } = await upload();
    storage.fail('fetchVariant');
    const res = await asha.get(`/api/photos/${photoId}/image/thumb`);
    expect(res.status).toBe(502);
    expect(res.body.error.code).toBe('IMAGE_UNAVAILABLE');
  });
});

describe('DELETE /api/photos/:id', () => {
  it('removes the image and the record', async () => {
    const { photoId, publicId } = await upload();
    expect((await asha.delete(`/api/photos/${photoId}`)).status).toBe(204);
    expect(storage.assets.has(publicId)).toBe(false);
    expect(await PhotoModel.countDocuments()).toBe(0);
    expect((await asha.get(`/api/books/${bookId}/photos`)).body.photos).toEqual([]);
  });

  it('hides the photo during a storage outage, lets the file be re-added, and the sweeper finishes', async () => {
    const { photoId, publicId } = await upload();
    storage.fail('destroy');
    expect((await asha.delete(`/api/photos/${photoId}`)).status).toBe(204);

    const stuck = await PhotoModel.findById(photoId).lean();
    expect(stuck?.status).toBe('deleting');
    expect(stuck?.contentHash).toBeUndefined();
    expect((await asha.get(`/api/books/${bookId}/photos`)).body.photos).toEqual([]);
    expect((await asha.get(`/api/photos/${photoId}/image/thumb`)).status).toBe(404);

    // The same file can be uploaded again straight away.
    const again = await announce(PHOTO);
    expect(again.status).toBe('upload');
    expect(again.photoId).not.toBe(photoId);

    storage.heal();
    const report = await sweep(storage, 'test');
    expect(report.failures).toBe(0);
    expect(await PhotoModel.findById(photoId)).toBeNull();
    expect(storage.assets.has(publicId)).toBe(false);
  });

  it("cannot delete someone else's photo", async () => {
    const { photoId } = await upload();
    const ben = await loggedInAgent(app, 'ben@example.com');
    expect((await ben.delete(`/api/photos/${photoId}`)).status).toBe(404);
    expect((await PhotoModel.findById(photoId))?.status).toBe('ready');
  });
});

describe('deleting a book', () => {
  it('removes its photos and images now, and the book record after the grace period', async () => {
    const a = await upload(PHOTO);
    const b = await upload(makeJpeg({ rgb: [10, 20, 30] }));
    expect((await asha.delete(`/api/books/${bookId}`)).status).toBe(204);

    expect(storage.assets.size).toBe(0);
    expect(await PhotoModel.countDocuments()).toBe(0);
    expect((await asha.get(`/api/books/${bookId}`)).status).toBe(404);
    expect((await asha.get(`/api/photos/${a.photoId}/image/thumb`)).status).toBe(404);
    expect((await BookModel.findById(bookId))?.state).toBe('deleting');

    // A late upload lands after the first cleanup...
    storage.simulateUpload(b.publicId, PHOTO);
    await sweep(storage, 'test');
    expect(await BookModel.findById(bookId)).not.toBeNull(); // grace period not over

    // ...and the final pass, once signatures have expired, removes it and the book.
    await age(BookModel, bookId, BOOK_DELETE_GRACE_MS + 1000);
    const report = await sweep(storage, 'test');
    expect(report.removedBooks).toBe(1);
    expect(storage.assets.size).toBe(0);
    expect(await BookModel.findById(bookId)).toBeNull();
  });

  it('survives a storage outage and is finished by the sweeper', async () => {
    await upload();
    storage.fail('destroyPrefix');
    expect((await asha.delete(`/api/books/${bookId}`)).status).toBe(204);
    expect(await PhotoModel.countDocuments({ status: 'deleting' })).toBe(1);
    expect((await asha.get('/api/books')).body.books).toEqual([]);

    storage.heal();
    await age(BookModel, bookId, BOOK_DELETE_GRACE_MS + 1000);
    await sweep(storage, 'test');
    expect(await PhotoModel.countDocuments()).toBe(0);
    expect(await BookModel.countDocuments()).toBe(0);
    expect(storage.assets.size).toBe(0);
  });
});

describe('sweeper', () => {
  it('clears uploads abandoned for over 2 hours, but not recent ones', async () => {
    const stale = await announce(PHOTO);
    storage.simulateUpload(stale.upload.fields.public_id, PHOTO); // uploaded, never confirmed
    const fresh = await announce(makeJpeg({ rgb: [1, 2, 3] }));
    await age(PhotoModel, stale.photoId, STALE_PENDING_MS + 1000);

    await sweep(storage, 'test');
    expect(await PhotoModel.findById(stale.photoId)).toBeNull();
    expect(storage.assets.has(stale.upload.fields.public_id)).toBe(false);
    expect((await PhotoModel.findById(fresh.photoId))?.status).toBe('pending');
  });

  it('clears failed uploads after a day', async () => {
    const intent = await announce(PHOTO);
    await PhotoModel.updateOne({ _id: intent.photoId }, { $set: { status: 'failed' } });
    await sweep(storage, 'test');
    expect(await PhotoModel.findById(intent.photoId)).not.toBeNull();

    await age(PhotoModel, intent.photoId, STALE_FAILED_MS + 1000);
    await sweep(storage, 'test');
    expect(await PhotoModel.findById(intent.photoId)).toBeNull();
  });

  it('never touches ready photos and is safe to run repeatedly', async () => {
    const { photoId } = await upload();
    await age(PhotoModel, photoId, STALE_FAILED_MS * 10);
    await sweep(storage, 'test');
    await sweep(storage, 'test');
    expect((await PhotoModel.findById(photoId))?.status).toBe('ready');
    expect(mongoose.isValidObjectId(photoId)).toBe(true);
  });
});
