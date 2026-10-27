import mongoose from 'mongoose';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../../app.ts';
import { loggedInAgent, startTestDatabase, TEST_CONFIG } from '../../test/helpers.ts';
import { UserModel } from '../auth/user.model.ts';
import { BookModel } from './book.model.ts';

const app = createApp(TEST_CONFIG);
const JAPAN = {
  title: 'Whispers of Japan',
  startDate: '2026-10-10',
  endDate: '2026-10-15',
  defaultTz: 'Asia/Tokyo',
  destinations: ['Tokyo', 'Kyoto', 'Osaka'],
};

let stopDatabase: () => Promise<void>;
beforeAll(async () => {
  stopDatabase = await startTestDatabase();
});
afterAll(() => stopDatabase());
beforeEach(async () => {
  await UserModel.deleteMany({});
  await BookModel.deleteMany({});
});

describe('creating and reading books', () => {
  it('creates a book with server-owned defaults', async () => {
    const asha = await loggedInAgent(app, 'asha@example.com');
    const res = await asha.post('/api/books').send(JAPAN);

    expect(res.status).toBe(201);
    expect(res.body.book).toEqual({
      id: expect.any(String),
      ...JAPAN,
      description: '',
      theme: { kind: 'preset', id: 'editorial', version: 1 },
      days: [],
      chapters: [],
      chaptersEdited: false,
      overrides: { coverPhotoId: null, dayLayouts: [], photoOrder: [] },
      createdAt: expect.any(String),
      updatedAt: expect.any(String),
    });
    expect(JSON.stringify(res.body)).not.toMatch(/userId|state|schemaVersion/);
  });

  it('reopens a saved book by id', async () => {
    const asha = await loggedInAgent(app, 'asha@example.com');
    const created = (await asha.post('/api/books').send(JAPAN)).body.book;
    const res = await asha.get(`/api/books/${created.id}`);
    expect(res.status).toBe(200);
    expect(res.body.book).toEqual(created);
  });

  it('lists only my books, most recently edited first', async () => {
    const asha = await loggedInAgent(app, 'asha@example.com');
    const ben = await loggedInAgent(app, 'ben@example.com');
    const first = (await asha.post('/api/books').send({ ...JAPAN, title: 'First' })).body.book;
    await asha.post('/api/books').send({ ...JAPAN, title: 'Second' });
    await ben.post('/api/books').send({ ...JAPAN, title: "Ben's trip" });
    await asha.patch(`/api/books/${first.id}`).send({ description: 'edited last' });

    const res = await asha.get('/api/books');
    expect(res.status).toBe(200);
    expect(res.body.books.map((b: { title: string }) => b.title)).toEqual(['First', 'Second']);
  });

  it('rejects invalid input and fields the server owns', async () => {
    const asha = await loggedInAgent(app, 'asha@example.com');
    const bad = await asha.post('/api/books').send({ ...JAPAN, endDate: '2026-10-01' });
    expect(bad.status).toBe(400);
    expect(bad.body.error.details).toEqual([
      { path: 'endDate', message: 'End date must be on or after the start date' },
    ]);

    const injected = await asha
      .post('/api/books')
      .send({ ...JAPAN, userId: new mongoose.Types.ObjectId().toString() });
    expect(injected.status).toBe(400);
    expect(await BookModel.countDocuments()).toBe(0);
  });
});

describe('updating books', () => {
  it('changes only the submitted fields', async () => {
    const asha = await loggedInAgent(app, 'asha@example.com');
    const created = (await asha.post('/api/books').send(JAPAN)).body.book;

    const res = await asha
      .patch(`/api/books/${created.id}`)
      .send({ title: 'Kyoto & beyond', destinations: ['Kyoto'] });

    expect(res.status).toBe(200);
    expect(res.body.book).toMatchObject({
      title: 'Kyoto & beyond',
      destinations: ['Kyoto'],
      startDate: JAPAN.startDate,
      defaultTz: JAPAN.defaultTz,
    });
  });

  it('checks one changed date against the stored other end', async () => {
    const asha = await loggedInAgent(app, 'asha@example.com');
    const created = (await asha.post('/api/books').send(JAPAN)).body.book;

    const tooEarly = await asha.patch(`/api/books/${created.id}`).send({ endDate: '2026-10-09' });
    expect(tooEarly.status).toBe(400);
    expect(tooEarly.body.error.details[0].path).toBe('endDate');

    const tooLate = await asha.patch(`/api/books/${created.id}`).send({ startDate: '2026-10-20' });
    expect(tooLate.status).toBe(400);
    expect(tooLate.body.error.details[0].path).toBe('startDate');

    const ok = await asha.patch(`/api/books/${created.id}`).send({ endDate: '2026-10-20' });
    expect(ok.status).toBe(200);
    expect(ok.body.book.endDate).toBe('2026-10-20');
  });

  it('rejects an empty update and server-owned fields', async () => {
    const asha = await loggedInAgent(app, 'asha@example.com');
    const created = (await asha.post('/api/books').send(JAPAN)).body.book;
    expect((await asha.patch(`/api/books/${created.id}`).send({})).status).toBe(400);
    expect((await asha.patch(`/api/books/${created.id}`).send({ state: 'deleting' })).status).toBe(
      400,
    );
  });
});

describe('choosing a theme', () => {
  it('sets the theme at its newest version', async () => {
    const asha = await loggedInAgent(app, 'asha@example.com');
    const { id } = (await asha.post('/api/books').send(JAPAN)).body.book;
    const res = await asha.put(`/api/books/${id}/theme`).send({ id: 'scrapbook' });
    expect(res.status).toBe(200);
    expect(res.body.book.theme).toEqual({ kind: 'preset', id: 'scrapbook', version: 1 });
    expect((await asha.get(`/api/books/${id}`)).body.book.theme.id).toBe('scrapbook');
  });

  it('moves a book pinned to an old version forward only when the theme is picked again', async () => {
    const asha = await loggedInAgent(app, 'asha@example.com');
    const { id } = (await asha.post('/api/books').send(JAPAN)).body.book;
    await BookModel.updateOne({ _id: id }, { $set: { 'theme.version': 7 } });
    expect(
      (await asha.patch(`/api/books/${id}`).send({ title: 'Edited' })).body.book.theme,
    ).toEqual({ kind: 'preset', id: 'editorial', version: 7 });
    const res = await asha.put(`/api/books/${id}/theme`).send({ id: 'editorial' });
    expect(res.body.book.theme.version).toBe(1);
  });

  it('accepts only a known theme and nothing else', async () => {
    const asha = await loggedInAgent(app, 'asha@example.com');
    const { id } = (await asha.post('/api/books').send(JAPAN)).body.book;
    for (const body of [
      { id: 'vaporwave' },
      {},
      { id: 'atlas', version: 1 },
      { id: 'atlas', kind: 'custom' },
    ]) {
      const res = await asha.put(`/api/books/${id}/theme`).send(body);
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_FAILED');
    }
    expect((await BookModel.findById(id))?.theme.id).toBe('editorial');
  });
});

describe('deleting books', () => {
  it('removes the book so it can no longer be read', async () => {
    const asha = await loggedInAgent(app, 'asha@example.com');
    const created = (await asha.post('/api/books').send(JAPAN)).body.book;

    expect((await asha.delete(`/api/books/${created.id}`)).status).toBe(204);
    expect((await asha.get(`/api/books/${created.id}`)).status).toBe(404);
    expect((await asha.get('/api/books')).body.books).toEqual([]);
    expect((await asha.delete(`/api/books/${created.id}`)).status).toBe(404);
  });

  it('hides a book that is mid-deletion', async () => {
    const asha = await loggedInAgent(app, 'asha@example.com');
    const created = (await asha.post('/api/books').send(JAPAN)).body.book;
    await BookModel.updateOne({ _id: created.id }, { $set: { state: 'deleting' } });

    expect((await asha.get(`/api/books/${created.id}`)).status).toBe(404);
    expect((await asha.get('/api/books')).body.books).toEqual([]);
  });
});

describe('ownership: another user gets 404 and changes nothing', () => {
  let bookId: string;
  let ben: Awaited<ReturnType<typeof loggedInAgent>>;

  beforeEach(async () => {
    const asha = await loggedInAgent(app, 'asha@example.com');
    bookId = (await asha.post('/api/books').send(JAPAN)).body.book.id;
    ben = await loggedInAgent(app, 'ben@example.com');
  });

  const NOT_FOUND = { error: { code: 'NOT_FOUND', message: 'Not found' } };

  it('cannot read it', async () => {
    const res = await ben.get(`/api/books/${bookId}`);
    expect(res.status).toBe(404);
    expect(res.body).toEqual(NOT_FOUND);
  });

  it('cannot update it', async () => {
    const res = await ben.patch(`/api/books/${bookId}`).send({ title: 'Hijacked' });
    expect(res.status).toBe(404);
    expect(res.body).toEqual(NOT_FOUND);
    expect((await BookModel.findById(bookId))?.title).toBe(JAPAN.title);
  });

  it('cannot change its theme', async () => {
    const res = await ben.put(`/api/books/${bookId}/theme`).send({ id: 'atlas' });
    expect(res.status).toBe(404);
    expect(res.body).toEqual(NOT_FOUND);
    expect((await BookModel.findById(bookId))?.theme.id).toBe('editorial');
  });

  it('cannot delete it', async () => {
    const res = await ben.delete(`/api/books/${bookId}`);
    expect(res.status).toBe(404);
    expect(await BookModel.countDocuments({ _id: bookId, state: 'active' })).toBe(1);
  });

  it('does not see it in their list', async () => {
    expect((await ben.get('/api/books')).body.books).toEqual([]);
  });

  it('gets the same 404 for a missing id and a malformed id', async () => {
    for (const id of [new mongoose.Types.ObjectId().toString(), 'not-an-id', '1']) {
      const res = await ben.get(`/api/books/${id}`);
      expect(res.status).toBe(404);
      expect(res.body).toEqual(NOT_FOUND);
    }
  });
});

describe('authentication is required on every book route', () => {
  const id = new mongoose.Types.ObjectId().toString();
  it.each([
    ['GET', '/api/books'],
    ['POST', '/api/books'],
    ['GET', `/api/books/${id}`],
    ['PATCH', `/api/books/${id}`],
    ['DELETE', `/api/books/${id}`],
    ['PUT', `/api/books/${id}/theme`],
  ])('%s %s answers 401 when logged out', async (method, path) => {
    const res = await request(app)
      [method.toLowerCase() as 'get' | 'post' | 'patch' | 'put' | 'delete'](path)
      .send(method === 'GET' || method === 'DELETE' ? undefined : JAPAN);
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHENTICATED');
    expect(await BookModel.countDocuments()).toBe(0);
  });
});
