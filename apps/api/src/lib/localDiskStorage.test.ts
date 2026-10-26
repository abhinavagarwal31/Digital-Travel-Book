import { createHash } from 'node:crypto';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../app.ts';
import { loggedInAgent, startTestDatabase, TEST_CONFIG } from '../test/helpers.ts';
import { makeJpeg } from '../test/makeJpeg.ts';
import { LOCAL_UPLOAD_PATH, LocalDiskStorage } from './localDiskStorage.ts';

const root = mkdtempSync(join(tmpdir(), 'tb-local-storage-'));
const storage = new LocalDiskStorage(root);
const app = createApp({ ...TEST_CONFIG, storage, storageNamespace: 'development' });
const PHOTO = makeJpeg({
  exif: { dateTimeOriginal: '2026:10:12 17:42:10', offsetTimeOriginal: '+09:00' },
});

let stopDatabase: () => Promise<void>;
beforeAll(async () => {
  stopDatabase = await startTestDatabase();
});
afterAll(async () => {
  await stopDatabase();
  rmSync(root, { recursive: true, force: true });
});

/** What the browser does with the fields the API hands out. */
function postToStorage(fields: Record<string, string>, bytes: Buffer) {
  const req = request(app).post(LOCAL_UPLOAD_PATH);
  for (const [name, value] of Object.entries(fields)) req.field(name, value);
  return req.attach('file', bytes, 'IMG_0001.JPG');
}

describe('LocalDiskStorage (development stand-in for Cloudinary)', () => {
  it('runs the real upload flow end to end', async () => {
    const asha = await loggedInAgent(app, 'asha@example.com');
    const bookId = (
      await asha.post('/api/books').send({
        title: 'Japan',
        startDate: '2026-10-10',
        endDate: '2026-10-15',
        defaultTz: 'Asia/Tokyo',
      })
    ).body.book.id;
    const clientHash = createHash('sha256').update(PHOTO).digest('hex');
    const intent = (
      await asha.post(`/api/books/${bookId}/uploads`).send({
        files: [{ filename: 'IMG_0001.JPG', mime: 'image/jpeg', bytes: PHOTO.length, clientHash }],
      })
    ).body.results[0];
    expect(intent.upload.url).toBe(LOCAL_UPLOAD_PATH);

    const stored = await postToStorage(intent.upload.fields, PHOTO);
    expect(stored.status).toBe(200);
    expect(stored.body.public_id).toBe(intent.upload.fields.public_id);

    const confirm = await asha
      .post(`/api/photos/${intent.photoId}/confirm`)
      .send({ version: stored.body.version, signature: stored.body.signature });
    expect(confirm.status).toBe(200);
    expect(confirm.body.photo).toMatchObject({ status: 'ready', dayDate: '2026-10-12' });

    const image = await asha.get(`/api/photos/${intent.photoId}/image/thumb`).buffer(true);
    expect(image.status).toBe(200);
    expect(image.headers['content-type']).toBe('image/jpeg');
    expect(Buffer.compare(image.body, PHOTO)).toBe(0);

    expect((await asha.delete(`/api/books/${bookId}`)).status).toBe(204);
    expect(existsSync(join(root, intent.upload.fields.public_id))).toBe(false);
  });

  it('refuses an upload with a forged signature', async () => {
    const fields = storage.signUpload('tb/development/u/a/b/c/x');
    const res = await postToStorage({ ...fields.fields, signature: 'f'.repeat(64) }, PHOTO);
    expect(res.status).toBe(400);
  });

  it('refuses a signature reused for another id', async () => {
    const fields = storage.signUpload('tb/development/u/a/b/c/x').fields;
    const res = await postToStorage({ ...fields, public_id: 'tb/development/u/a/b/c/y' }, PHOTO);
    expect(res.status).toBe(400);
  });

  it.each(['../outside', 'tb/../../etc/passwd', '/absolute', 'a//b', 'a/b/'])(
    'refuses the path-traversing id %j',
    async (publicId) => {
      await expect(storage.fetchOriginal(publicId, 1, 1000)).rejects.toThrow();
      expect(() => storage.signUpload(publicId)).not.toThrow(); // signing is harmless…
      const res = await postToStorage(storage.signUpload(publicId).fields, PHOTO);
      expect(res.status).toBe(400); // …but nothing is written
    },
  );
});
