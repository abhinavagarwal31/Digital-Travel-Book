import jwt from 'jsonwebtoken';
import mongoose from 'mongoose';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../../app.ts';
import { startTestDatabase, TEST_CONFIG, TEST_JWT_SECRET } from '../../test/helpers.ts';
import { SESSION_COOKIE } from './session.ts';
import { UserModel } from './user.model.ts';

const app = createApp(TEST_CONFIG);
const ASHA = { name: 'Asha Rao', email: 'asha@example.com', password: 'correct horse battery' };

let stopDatabase: () => Promise<void>;
beforeAll(async () => {
  stopDatabase = await startTestDatabase();
});
afterAll(() => stopDatabase());
beforeEach(() => UserModel.deleteMany({}));

function sessionCookie(res: request.Response): string {
  const cookies = ([] as string[]).concat(res.headers['set-cookie'] ?? []);
  const cookie = cookies.find((c) => c.startsWith(`${SESSION_COOKIE}=`));
  if (!cookie) throw new Error('no session cookie set');
  return cookie;
}

function cookieHeader(token: string): string {
  return `${SESSION_COOKIE}=${token}`;
}

async function register(body = ASHA) {
  return request(app).post('/api/auth/register').send(body);
}

describe('POST /api/auth/register', () => {
  it('creates the account, returns it without secrets and starts a session', async () => {
    const res = await register({ ...ASHA, email: '  Asha@Example.COM ' });

    expect(res.status).toBe(201);
    expect(res.body.user).toEqual({
      id: expect.any(String),
      name: 'Asha Rao',
      email: 'asha@example.com',
      createdAt: expect.any(String),
    });
    expect(JSON.stringify(res.body)).not.toMatch(/password|scrypt|plan/i);

    const cookie = sessionCookie(res);
    expect(cookie).toMatch(/HttpOnly/);
    expect(cookie).toMatch(/SameSite=Lax/);
    expect(cookie).toMatch(/Path=\//);
    expect(cookie).toMatch(/Max-Age=604800/);
    expect(cookie).not.toMatch(/Secure/); // local http in tests
  });

  it('stores a salted scrypt hash, never the password', async () => {
    await register();
    const stored = await UserModel.findOne({ email: ASHA.email }).select('+passwordHash').lean();
    expect(stored?.passwordHash).toMatch(/^scrypt\$/);
    expect(stored?.passwordHash).not.toContain(ASHA.password);
  });

  it('rejects a second account with the same email, ignoring case', async () => {
    await register();
    const res = await register({ ...ASHA, email: 'ASHA@example.com' });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('EMAIL_TAKEN');
    expect(await UserModel.countDocuments()).toBe(1);
  });

  it('reports every invalid field without echoing the password', async () => {
    const res = await register({ name: '', email: 'nope', password: 'short1' });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_FAILED');
    const paths = res.body.error.details.map((d: { path: string }) => d.path).sort();
    expect(paths).toEqual(['email', 'name', 'password']);
    expect(JSON.stringify(res.body)).not.toContain('short1');
  });
});

describe('POST /api/auth/login', () => {
  beforeEach(() => register());

  it('logs in with the right password, matching email case-insensitively', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'ASHA@example.com', password: ASHA.password });
    expect(res.status).toBe(200);
    expect(res.body.user.email).toBe('asha@example.com');
    expect(sessionCookie(res)).toMatch(/HttpOnly/);
  });

  it('gives the same answer for a wrong password and an unknown email', async () => {
    const wrongPassword = await request(app)
      .post('/api/auth/login')
      .send({ email: ASHA.email, password: 'wrong password' });
    const unknownEmail = await request(app)
      .post('/api/auth/login')
      .send({ email: 'nobody@example.com', password: 'wrong password' });

    for (const res of [wrongPassword, unknownEmail]) {
      expect(res.status).toBe(401);
      expect(res.body).toEqual({
        error: { code: 'INVALID_CREDENTIALS', message: 'Email or password is incorrect' },
      });
      expect(res.headers['set-cookie']).toBeUndefined();
    }
  });
});

describe('GET /api/auth/me and sessions', () => {
  it('restores the session from the cookie (page refresh)', async () => {
    const agent = request.agent(app);
    await agent.post('/api/auth/register').send(ASHA);
    const res = await agent.get('/api/auth/me');
    expect(res.status).toBe(200);
    expect(res.body.user.email).toBe(ASHA.email);
  });

  it('answers 401 without a cookie', async () => {
    const res = await request(app).get('/api/auth/me');
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHENTICATED');
  });

  it('logout clears the cookie and ends the session', async () => {
    const agent = request.agent(app);
    await agent.post('/api/auth/register').send(ASHA);

    const out = await agent.post('/api/auth/logout').send({});
    expect(out.status).toBe(204);
    expect(sessionCookie(out)).toMatch(/Expires=Thu, 01 Jan 1970/);

    expect((await agent.get('/api/auth/me')).status).toBe(401);
  });

  describe('rejects forged, expired and stale tokens, and clears the cookie', () => {
    let userId: string;
    beforeEach(async () => {
      userId = (await register()).body.user.id;
    });

    const cases: Array<[string, () => string]> = [
      [
        'expired',
        () => jwt.sign({ sub: userId, exp: Math.floor(Date.now() / 1000) - 60 }, TEST_JWT_SECRET),
      ],
      ['signed with another secret', () => jwt.sign({ sub: userId }, 'x'.repeat(40))],
      ['unsigned (alg none)', () => jwt.sign({ sub: userId }, '', { algorithm: 'none' })],
      ['malformed', () => 'not.a.jwt'],
      ['without a subject', () => jwt.sign({}, TEST_JWT_SECRET)],
      [
        'for a user that no longer exists',
        () => jwt.sign({ sub: new mongoose.Types.ObjectId().toString() }, TEST_JWT_SECRET),
      ],
    ];

    it.each(cases)('%s', async (_label, makeToken) => {
      const res = await request(app).get('/api/auth/me').set('Cookie', cookieHeader(makeToken()));
      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('UNAUTHENTICATED');
      expect(sessionCookie(res)).toMatch(/Expires=Thu, 01 Jan 1970/);
    });

    it('accepts a correctly signed, unexpired token', async () => {
      const token = jwt.sign({}, TEST_JWT_SECRET, { subject: userId, expiresIn: 60 });
      const res = await request(app).get('/api/auth/me').set('Cookie', cookieHeader(token));
      expect(res.status).toBe(200);
    });
  });
});

describe('cookie security in production', () => {
  it('marks the session cookie Secure', async () => {
    const prod = createApp({ ...TEST_CONFIG, cookieSecure: true });
    const res = await request(prod).post('/api/auth/register').send(ASHA);
    expect(sessionCookie(res)).toMatch(/; Secure/);
  });
});

describe('rate limiting', () => {
  it('blocks a client after too many attempts, per IP', async () => {
    const limited = createApp({ ...TEST_CONFIG, authRateLimit: { windowMs: 60_000, limit: 3 } });
    const attempt = (ip: string) =>
      request(limited)
        .post('/api/auth/login')
        .set('X-Forwarded-For', ip)
        .send({ email: 'a@example.com', password: 'whatever' });

    for (let i = 0; i < 3; i++) expect((await attempt('203.0.113.7')).status).toBe(401);

    const blocked = await attempt('203.0.113.7');
    expect(blocked.status).toBe(429);
    expect(blocked.body.error.code).toBe('RATE_LIMITED');

    // A different client (another IP behind the proxy) is unaffected.
    expect((await attempt('198.51.100.9')).status).toBe(401);
  });
});
