import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../../app.ts';
import { FakeStorage } from '../../test/fakeStorage.ts';
import { loggedInAgent, startTestDatabase, TEST_CONFIG } from '../../test/helpers.ts';
import { UserModel } from '../auth/user.model.ts';
import { BookModel } from '../books/book.model.ts';
import { PhotoModel } from '../photos/photo.model.ts';

const storage = new FakeStorage();
const app = createApp({ ...TEST_CONFIG, storage, storageNamespace: 'test' });
const PASSWORD = 'correct horse battery'; // what loggedInAgent registers with
const JAPAN = {
  title: 'Whispers of Japan',
  startDate: '2026-10-10',
  endDate: '2026-10-15',
  defaultTz: 'Asia/Tokyo',
};

let stopDatabase: () => Promise<void>;
beforeAll(async () => {
  stopDatabase = await startTestDatabase();
});
afterAll(() => stopDatabase());
beforeEach(async () => {
  await Promise.all([
    UserModel.deleteMany({}),
    BookModel.deleteMany({}),
    PhotoModel.deleteMany({}),
  ]);
});

async function addPhotos(userId: string, bookId: string, count: number) {
  await PhotoModel.insertMany(
    Array.from({ length: count }, (_, i) => ({
      userId,
      bookId,
      originalFilename: `${i}.jpg`,
      mime: 'image/jpeg',
      bytes: 1,
      contentHash: `${bookId}-${i}`,
      storage: { publicId: `tb/test/u/${userId}/b/${bookId}/${i}`, version: 1 },
      status: 'ready',
    })),
  );
}

describe('GET /account', () => {
  it('shows the plan, its photo limit and how much is used', async () => {
    const asha = await loggedInAgent(app, 'asha@example.com');
    const userId = (await asha.get('/api/auth/me')).body.user.id;
    const small = (await asha.post('/api/books').send({ ...JAPAN, title: 'Small' })).body.book.id;
    const big = (await asha.post('/api/books').send({ ...JAPAN, title: 'Big' })).body.book.id;
    await addPhotos(userId, small, 3);
    await addPhotos(userId, big, 12);

    const res = await asha.get('/api/account');
    expect(res.status).toBe(200);
    expect(res.body.account).toEqual({
      user: { id: userId, name: 'asha', email: 'asha@example.com', createdAt: expect.any(String) },
      plan: 'free',
      photoLimit: 200,
      usage: { books: 2, photos: 15, fullestBook: { id: big, title: 'Big', photos: 12 } },
    });
    expect(JSON.stringify(res.body)).not.toMatch(/passwordHash|sessionVersion/);
  });
});

describe('PATCH /account', () => {
  it('renames without a password, but needs the right one to change the email', async () => {
    const asha = await loggedInAgent(app, 'asha@example.com');
    expect(
      (await asha.patch('/api/account').send({ name: 'Asha Rao' })).body.account.user.name,
    ).toBe('Asha Rao');
    expect((await asha.patch('/api/account').send({ email: 'new@example.com' })).status).toBe(400);
    const wrong = await asha
      .patch('/api/account')
      .send({ email: 'new@example.com', currentPassword: 'not it' });
    expect(wrong.status).toBe(400);
    expect(wrong.body.error.details).toEqual([
      { path: 'currentPassword', message: 'That password is not right' },
    ]);
    const ok = await asha
      .patch('/api/account')
      .send({ email: ' New@Example.com ', currentPassword: PASSWORD });
    expect(ok.body.account.user.email).toBe('new@example.com');
  });

  it("refuses another account's email", async () => {
    await loggedInAgent(app, 'ben@example.com');
    const asha = await loggedInAgent(app, 'asha@example.com');
    const res = await asha
      .patch('/api/account')
      .send({ email: 'ben@example.com', currentPassword: PASSWORD });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('EMAIL_TAKEN');
  });
});

describe('signing out other devices', () => {
  it('a new password signs out every other session, keeps this one, and replaces the old', async () => {
    const laptop = await loggedInAgent(app, 'asha@example.com');
    const phone = request.agent(app);
    await phone.post('/api/auth/login').send({ email: 'asha@example.com', password: PASSWORD });
    expect((await phone.get('/api/auth/me')).status).toBe(200);

    expect(
      (
        await laptop
          .put('/api/account/password')
          .send({ currentPassword: 'no', newPassword: 'a-new-password' })
      ).status,
    ).toBe(400);
    const res = await laptop
      .put('/api/account/password')
      .send({ currentPassword: PASSWORD, newPassword: 'a-new-password' });
    expect(res.status).toBe(204);

    expect((await laptop.get('/api/auth/me')).status).toBe(200);
    expect((await phone.get('/api/auth/me')).status).toBe(401);
    const login = (password: string) =>
      request(app).post('/api/auth/login').send({ email: 'asha@example.com', password });
    expect((await login(PASSWORD)).status).toBe(401);
    expect((await login('a-new-password')).status).toBe(200);
  });

  it('can sign out the other devices without changing the password', async () => {
    const laptop = await loggedInAgent(app, 'asha@example.com');
    const phone = request.agent(app);
    await phone.post('/api/auth/login').send({ email: 'asha@example.com', password: PASSWORD });
    expect((await laptop.post('/api/account/sessions/sign-out-others').send({})).status).toBe(204);
    expect((await laptop.get('/api/auth/me')).status).toBe(200);
    expect((await phone.get('/api/auth/me')).status).toBe(401);
  });

  it('keeps accounts made before session versions signed in', async () => {
    const asha = await loggedInAgent(app, 'asha@example.com');
    await UserModel.collection.updateMany({}, { $unset: { sessionVersion: 1 } });
    expect((await asha.get('/api/auth/me')).status).toBe(200);
  });
});

describe('DELETE /account', () => {
  it('needs the password, then removes the account, its books, photos and images', async () => {
    const asha = await loggedInAgent(app, 'asha@example.com');
    const ben = await loggedInAgent(app, 'ben@example.com');
    const ashaId = (await asha.get('/api/auth/me')).body.user.id;
    const benId = (await ben.get('/api/auth/me')).body.user.id;
    const ashaBook = (await asha.post('/api/books').send(JAPAN)).body.book.id;
    const benBook = (await ben.post('/api/books').send(JAPAN)).body.book.id;
    await addPhotos(ashaId, ashaBook, 2);
    await addPhotos(benId, benBook, 2);
    storage.assets.set(`tb/test/u/${ashaId}/b/${ashaBook}/0`, {
      bytes: Buffer.from('a'),
      version: 1,
    });
    storage.assets.set(`tb/test/u/${benId}/b/${benBook}/0`, {
      bytes: Buffer.from('b'),
      version: 1,
    });

    expect((await asha.delete('/api/account').send({ password: 'nope' })).status).toBe(400);
    expect(await UserModel.countDocuments({ _id: ashaId })).toBe(1);

    expect((await asha.delete('/api/account').send({ password: PASSWORD })).status).toBe(204);
    expect(await UserModel.countDocuments({ _id: ashaId })).toBe(0);
    expect(await BookModel.countDocuments({ userId: ashaId, state: 'active' })).toBe(0);
    expect(await PhotoModel.countDocuments({ userId: ashaId })).toBe(0);
    expect([...storage.assets.keys()].some((k) => k.includes(ashaId))).toBe(false);
    expect((await asha.get('/api/auth/me')).status).toBe(401);

    // Nobody else is touched, and the email is free again.
    expect(await PhotoModel.countDocuments({ userId: benId })).toBe(2);
    expect([...storage.assets.keys()].some((k) => k.includes(benId))).toBe(true);
    expect(
      (await loggedInAgent(app, 'asha@example.com').then((a) => a.get('/api/auth/me'))).status,
    ).toBe(200);
  });
});

describe('GET /account/places', () => {
  it("lists each book's places in time order, leaving out removed and suspicious ones", async () => {
    const asha = await loggedInAgent(app, 'asha@example.com');
    const ben = await loggedInAgent(app, 'ben@example.com');
    const userId = (await asha.get('/api/auth/me')).body.user.id;
    const benId = (await ben.get('/api/auth/me')).body.user.id;
    const book = (await asha.post('/api/books').send(JAPAN)).body.book.id;
    const empty = (await asha.post('/api/books').send({ ...JAPAN, title: 'No GPS' })).body.book.id;
    const bens = (await ben.post('/api/books').send(JAPAN)).body.book.id;
    const at = (
      owner: string,
      bookId: string,
      n: number,
      hour: number,
      lat: number,
      lng: number,
      extra: object = {},
    ) => ({
      userId: owner,
      bookId,
      originalFilename: `${n}.jpg`,
      mime: 'image/jpeg',
      bytes: 1,
      contentHash: `${bookId}-${n}`,
      storage: { publicId: `p/${n}`, version: 1 },
      status: 'ready',
      capturedAt: new Date(`2026-10-11T${String(hour).padStart(2, '0')}:00:00Z`),
      gps: { lat, lng },
      gpsStatus: 'exif',
      ...extra,
    });
    await PhotoModel.insertMany([
      at(userId, book, 2, 12, 35.01, 135.77), // Kyoto, later
      at(userId, book, 1, 2, 35.68, 139.76), // Tokyo, first
      at(userId, book, 3, 3, 35.69, 139.7), // Tokyo again, same place
      at(userId, book, 4, 5, 51.5, -0.12, { flags: ['gps_outlier'] }),
      at(userId, book, 5, 6, 10, 10, { gpsStatus: 'removed' }),
      at(userId, book, 6, 7, 20, 20, { hidden: true }),
      at(benId, bens, 7, 1, 40.7, -74),
    ]);
    const res = await asha.get('/api/account/places');
    expect(res.status).toBe(200);
    // A book without located photos has no path at all.
    expect(res.body.trips.some((t: { bookId: string }) => t.bookId === empty)).toBe(false);
    expect(res.body.trips).toEqual([
      {
        bookId: book,
        title: JAPAN.title,
        startDate: JAPAN.startDate,
        points: [
          { lat: 35.68, lng: 139.76 },
          { lat: 35.01, lng: 135.77 },
        ],
      },
    ]);
  });
});

it('every account route needs a session', async () => {
  for (const [method, path] of [
    ['get', '/api/account'],
    ['get', '/api/account/places'],
    ['patch', '/api/account'],
    ['put', '/api/account/password'],
    ['post', '/api/account/sessions/sign-out-others'],
    ['delete', '/api/account'],
  ] as const) {
    expect((await request(app)[method](path).send({})).status).toBe(401);
  }
});
