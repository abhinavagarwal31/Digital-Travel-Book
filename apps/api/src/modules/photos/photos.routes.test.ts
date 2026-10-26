import { MAX_PHOTOS_PER_BOOK, MAX_UPLOAD_BYTES, type UploadIntentResult } from '@tb/shared';
import mongoose from 'mongoose';
import { createHash } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../../app.ts';
import { FakeStorage } from '../../test/fakeStorage.ts';
import { loggedInAgent, startTestDatabase, TEST_CONFIG } from '../../test/helpers.ts';
import { makeJpeg } from '../../test/makeJpeg.ts';
import { UserModel } from '../auth/user.model.ts';
import { BookModel } from '../books/book.model.ts';
import { PhotoModel } from './photo.model.ts';

const storage = new FakeStorage();
const app = createApp({ ...TEST_CONFIG, storage, storageNamespace: 'test' });
type Agent = Awaited<ReturnType<typeof loggedInAgent>>;

const KYOTO_PHOTO = makeJpeg({
  exif: {
    dateTimeOriginal: '2026:10:12 17:42:10',
    offsetTimeOriginal: '+09:00',
    gps: { lat: 35.0116, lng: 135.7681 },
    make: 'Apple',
    model: 'iPhone 15',
  },
});
const OTHER_PHOTO = makeJpeg({ rgb: [40, 90, 160] });

const sha256 = (bytes: Buffer) => createHash('sha256').update(bytes).digest('hex');
const describeFile = (bytes: Buffer, filename = 'IMG_0001.JPG') => ({
  filename,
  mime: 'image/jpeg',
  bytes: bytes.length,
  clientHash: sha256(bytes),
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

async function announce(agent: Agent, files: object[], book = bookId) {
  return agent.post(`/api/books/${book}/uploads`).send({ files });
}

/** What the browser does: announce, upload to storage, confirm. */
async function uploadPhoto(agent: Agent, bytes: Buffer, uploadedBytes = bytes) {
  const intent = (await announce(agent, [describeFile(bytes)])).body.results[0];
  const { version, signature } = storage.simulateUpload(
    intent.upload.fields.public_id,
    uploadedBytes,
  );
  const confirm = await agent
    .post(`/api/photos/${intent.photoId}/confirm`)
    .send({ version, signature });
  return { intent, confirm };
}

describe('uploading a photo', () => {
  it('stores it, reads its metadata on the server and lists it', async () => {
    const { intent, confirm } = await uploadPhoto(asha, KYOTO_PHOTO);

    expect(intent.status).toBe('upload');
    const userId = (await asha.get('/api/auth/me')).body.user.id;
    expect(intent.upload.fields.public_id).toBe(
      `tb/test/u/${userId}/b/${bookId}/${intent.photoId}`,
    );

    expect(confirm.status).toBe(200);
    expect(confirm.body.photo).toMatchObject({
      id: intent.photoId,
      status: 'ready',
      mime: 'image/jpeg',
      bytes: KYOTO_PHOTO.length,
      localDateTime: '2026-10-12T17:42:10',
      capturedAt: '2026-10-12T08:42:10.000Z',
      timeSource: 'exif-offset',
      gpsStatus: 'exif',
      dayDate: '2026-10-12',
      assignedBy: 'auto',
      flags: [],
      camera: { make: 'Apple', model: 'iPhone 15' },
    });

    const list = await asha.get(`/api/books/${bookId}/photos`);
    expect(list.body.photos.map((p: { id: string }) => p.id)).toEqual([intent.photoId]);
  });

  it('never exposes storage ids, URLs or the content hash', async () => {
    await uploadPhoto(asha, KYOTO_PHOTO);
    const body = JSON.stringify((await asha.get(`/api/books/${bookId}/photos`)).body);
    expect(body).not.toMatch(/tb\/test|publicId|storage|contentHash|cloudinary/i);
    expect(body).not.toContain(sha256(KYOTO_PHOTO));
  });

  it('keeps the raw EXIF separately from the working values', async () => {
    const { intent } = await uploadPhoto(asha, KYOTO_PHOTO);
    const stored = await PhotoModel.findById(intent.photoId).lean();
    expect(stored?.exif).toMatchObject({ localDateTime: '2026-10-12T17:42:10', offset: '+09:00' });
  });

  it('gives a photo without metadata no time and no day', async () => {
    const { confirm } = await uploadPhoto(asha, OTHER_PHOTO);
    expect(confirm.body.photo).toMatchObject({
      localDateTime: null,
      capturedAt: null,
      gps: null,
      dayDate: null,
      flags: ['no_time'],
    });
  });

  it('confirming twice returns the same photo', async () => {
    const { intent, confirm } = await uploadPhoto(asha, KYOTO_PHOTO);
    const again = await asha
      .post(`/api/photos/${intent.photoId}/confirm`)
      .send({ version: 1, signature: 'a'.repeat(40) });
    expect(again.status).toBe(200);
    expect(again.body.photo).toEqual(confirm.body.photo);
  });
});

describe('duplicates', () => {
  it('reports a file the book already has', async () => {
    const { intent } = await uploadPhoto(asha, KYOTO_PHOTO);
    const res = await announce(asha, [describeFile(KYOTO_PHOTO, 'copy.jpg')]);
    expect(res.body.results).toEqual([
      { clientHash: sha256(KYOTO_PHOTO), photoId: intent.photoId, status: 'duplicate' },
    ]);
    expect(await PhotoModel.countDocuments()).toBe(1);
  });

  it('creates one record for the same file twice in one request', async () => {
    const res = await announce(asha, [
      describeFile(KYOTO_PHOTO, 'a.jpg'),
      describeFile(KYOTO_PHOTO, 'b.jpg'),
    ]);
    const [a, b] = res.body.results as UploadIntentResult[];
    expect(a?.photoId).toBe(b?.photoId);
    expect(await PhotoModel.countDocuments()).toBe(1);
  });

  it('re-announcing a pending upload reuses its record', async () => {
    const first = (await announce(asha, [describeFile(KYOTO_PHOTO)])).body.results[0];
    const second = (await announce(asha, [describeFile(KYOTO_PHOTO)])).body.results[0];
    expect(second.photoId).toBe(first.photoId);
    expect(second.status).toBe('upload');
    expect(await PhotoModel.countDocuments()).toBe(1);
  });

  it('allows the same file in two different books', async () => {
    await uploadPhoto(asha, KYOTO_PHOTO);
    const otherBook = (
      await asha.post('/api/books').send({
        title: 'Again',
        startDate: '2026-10-10',
        endDate: '2026-10-15',
        defaultTz: 'Asia/Tokyo',
      })
    ).body.book.id;
    const res = await announce(asha, [describeFile(KYOTO_PHOTO)], otherBook);
    expect(res.body.results[0].status).toBe('upload');
  });
});

describe('rejected uploads and retries', () => {
  it('rejects a file that is not the one announced, then accepts a retry', async () => {
    const { intent, confirm } = await uploadPhoto(asha, KYOTO_PHOTO, OTHER_PHOTO);
    expect(confirm.status).toBe(422);
    expect(confirm.body.error.code).toBe('HASH_MISMATCH');
    expect((await PhotoModel.findById(intent.photoId))?.status).toBe('failed');
    expect(storage.assets.has(intent.upload.fields.public_id)).toBe(false);

    const retry = await uploadPhoto(asha, KYOTO_PHOTO);
    expect(retry.intent.photoId).toBe(intent.photoId);
    expect(retry.confirm.status).toBe(200);
    expect(retry.confirm.body.photo.status).toBe('ready');
  });

  it('rejects a non-image disguised as a JPEG', async () => {
    const fake = Buffer.from('#!/bin/sh\necho not a photo\n');
    const { confirm } = await uploadPhoto(asha, fake);
    expect(confirm.status).toBe(422);
    expect(confirm.body.error.code).toBe('UNSUPPORTED_TYPE');
  });

  it('rejects a file over the size limit after downloading at most the limit', async () => {
    const huge = Buffer.concat([KYOTO_PHOTO, Buffer.alloc(MAX_UPLOAD_BYTES)]);
    const announced = { ...describeFile(KYOTO_PHOTO) }; // the browser lied about the size
    const intent = (await announce(asha, [announced])).body.results[0];
    const signed = storage.simulateUpload(intent.upload.fields.public_id, huge);
    const confirm = await asha.post(`/api/photos/${intent.photoId}/confirm`).send(signed);
    expect(confirm.status).toBe(422);
    expect(confirm.body.error.code).toBe('TOO_LARGE');
  });

  it('refuses a forged signature and leaves the photo pending', async () => {
    const intent = (await announce(asha, [describeFile(KYOTO_PHOTO)])).body.results[0];
    const { version } = storage.simulateUpload(intent.upload.fields.public_id, KYOTO_PHOTO);
    const res = await asha
      .post(`/api/photos/${intent.photoId}/confirm`)
      .send({ version, signature: 'f'.repeat(40) });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('INVALID_UPLOAD_SIGNATURE');
    expect((await PhotoModel.findById(intent.photoId))?.status).toBe('pending');
  });

  it("cannot confirm one photo with another photo's upload", async () => {
    const [x, y] = (
      await announce(asha, [describeFile(KYOTO_PHOTO, 'x.jpg'), describeFile(OTHER_PHOTO, 'y.jpg')])
    ).body.results;
    const yUpload = storage.simulateUpload(y.upload.fields.public_id, OTHER_PHOTO);
    const res = await asha.post(`/api/photos/${x.photoId}/confirm`).send(yUpload);
    expect(res.status).toBe(400);
    expect((await PhotoModel.findById(x.photoId))?.status).toBe('pending');
  });

  it('stays pending through a storage outage and confirms once it recovers', async () => {
    const intent = (await announce(asha, [describeFile(KYOTO_PHOTO)])).body.results[0];
    const signed = storage.simulateUpload(intent.upload.fields.public_id, KYOTO_PHOTO);

    storage.fail('fetchOriginal');
    const down = await asha.post(`/api/photos/${intent.photoId}/confirm`).send(signed);
    expect(down.status).toBe(502);
    expect((await PhotoModel.findById(intent.photoId))?.status).toBe('pending');

    storage.heal();
    const up = await asha.post(`/api/photos/${intent.photoId}/confirm`).send(signed);
    expect(up.status).toBe(200);
  });
});

describe('validation and limits', () => {
  it.each([
    ['a GIF', { mime: 'image/gif' }],
    ['a file over 10 MB', { bytes: MAX_UPLOAD_BYTES + 1 }],
    ['an empty file', { bytes: 0 }],
    ['a malformed hash', { clientHash: 'abc' }],
  ])('rejects %s before anything is stored', async (_label, change) => {
    const res = await announce(asha, [{ ...describeFile(KYOTO_PHOTO), ...change }]);
    expect(res.status).toBe(400);
    expect(await PhotoModel.countDocuments()).toBe(0);
  });

  it('rejects more than 50 files in one request', async () => {
    const files = Array.from({ length: 51 }, (_, i) => ({
      ...describeFile(KYOTO_PHOTO),
      clientHash: sha256(Buffer.from(String(i))),
    }));
    expect((await announce(asha, files)).status).toBe(400);
  });

  it(`stops a book at ${MAX_PHOTOS_PER_BOOK} photos`, async () => {
    const userId = (await asha.get('/api/auth/me')).body.user.id;
    await PhotoModel.insertMany(
      Array.from({ length: MAX_PHOTOS_PER_BOOK }, (_, i) => ({
        userId,
        bookId,
        originalFilename: `${i}.jpg`,
        mime: 'image/jpeg',
        bytes: 1,
        contentHash: sha256(Buffer.from(`existing-${i}`)),
        storage: { publicId: `p${i}`, version: 1 },
        status: 'ready',
      })),
    );
    const res = await announce(asha, [describeFile(KYOTO_PHOTO)]);
    expect(res.status).toBe(409);
    expect(res.body.error).toMatchObject({ code: 'PHOTO_LIMIT', details: { remaining: 0 } });
  });

  it('answers 503 when storage is not configured', async () => {
    const noStorage = createApp({ ...TEST_CONFIG, storage: null });
    const agent = await loggedInAgent(noStorage, 'ben@example.com');
    const book = (
      await agent.post('/api/books').send({
        title: 'x',
        startDate: '2026-10-10',
        endDate: '2026-10-11',
        defaultTz: 'UTC',
      })
    ).body.book.id;
    const res = await agent
      .post(`/api/books/${book}/uploads`)
      .send({ files: [describeFile(KYOTO_PHOTO)] });
    expect(res.status).toBe(503);
    expect(res.body.error.code).toBe('STORAGE_NOT_CONFIGURED');
  });
});

describe('ownership', () => {
  let ben: Agent;
  let photoId: string;
  beforeEach(async () => {
    photoId = (await uploadPhoto(asha, KYOTO_PHOTO)).intent.photoId;
    ben = await loggedInAgent(app, 'ben@example.com');
  });

  it("cannot upload into someone else's book", async () => {
    const res = await announce(ben, [describeFile(OTHER_PHOTO)]);
    expect(res.status).toBe(404);
    expect(await PhotoModel.countDocuments()).toBe(1);
  });

  it("cannot list someone else's photos", async () => {
    expect((await ben.get(`/api/books/${bookId}/photos`)).status).toBe(404);
  });

  it("cannot confirm someone else's photo", async () => {
    const res = await ben
      .post(`/api/photos/${photoId}/confirm`)
      .send({ version: 1, signature: 'a'.repeat(40) });
    expect(res.status).toBe(404);
  });

  it('gets 404 for a malformed photo id', async () => {
    const res = await ben
      .post(`/api/photos/not-an-id/confirm`)
      .send({ version: 1, signature: 'a'.repeat(40) });
    expect(res.status).toBe(404);
  });

  it('gets 401 when logged out', async () => {
    const res = await (await import('supertest')).default(app).get(`/api/books/${bookId}/photos`);
    expect(res.status).toBe(401);
  });

  it('cannot confirm into a book that is being deleted', async () => {
    const intent = (await announce(asha, [describeFile(OTHER_PHOTO)])).body.results[0];
    const signed = storage.simulateUpload(intent.upload.fields.public_id, OTHER_PHOTO);
    await BookModel.updateOne({ _id: bookId }, { $set: { state: 'deleting' } });
    const res = await asha.post(`/api/photos/${intent.photoId}/confirm`).send(signed);
    expect(res.status).toBe(404);
    expect(mongoose.isValidObjectId(intent.photoId)).toBe(true);
  });
});
