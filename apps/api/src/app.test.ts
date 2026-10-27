import express from 'express';
import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { createApp } from './app.ts';
import { errorHandler } from './lib/errors.ts';
import { TEST_CONFIG } from './test/helpers.ts';

let mongo: MongoMemoryServer;
const app = createApp(TEST_CONFIG);

beforeAll(async () => {
  mongo = await MongoMemoryServer.create();
  await mongoose.connect(mongo.getUri());
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongo.stop();
});

describe('GET /api/health', () => {
  it('reports ok while the database answers', async () => {
    const res = await request(app).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ok', db: 'up' });
  });
});

describe('unknown API routes', () => {
  it('return the JSON error envelope with 404', async () => {
    const res = await request(app).get('/api/does-not-exist');
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: { code: 'NOT_FOUND', message: 'Not found' } });
  });
});

describe('JSON-only writes', () => {
  it.each([
    ['text/plain', 'hello'],
    ['application/x-www-form-urlencoded', 'a=1'],
  ])('rejects a POST sent as %s with 415', async (type, body) => {
    const res = await request(app).post('/api/health').set('Content-Type', type).send(body);
    expect(res.status).toBe(415);
    expect(res.body.error.code).toBe('UNSUPPORTED_MEDIA_TYPE');
  });

  it('rejects a POST with no content type', async () => {
    const res = await request(app).post('/api/health');
    expect(res.status).toBe(415);
  });

  it('lets a JSON POST through to routing', async () => {
    const res = await request(app).post('/api/does-not-exist').send({});
    expect(res.status).toBe(404);
  });

  it('answers malformed JSON with 400 INVALID_JSON', async () => {
    const res = await request(app)
      .post('/api/does-not-exist')
      .set('Content-Type', 'application/json')
      .send('{"title": ');
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('INVALID_JSON');
  });

  it('answers an oversized body with 413', async () => {
    const res = await request(app)
      .post('/api/does-not-exist')
      .send({ text: 'x'.repeat(200 * 1024) });
    expect(res.status).toBe(413);
    expect(res.body.error.code).toBe('PAYLOAD_TOO_LARGE');
  });
});

describe('security headers', () => {
  it('sets helmet headers and hides the framework', async () => {
    const res = await request(app).get('/api/health');
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['content-security-policy']).toBeDefined();
    expect(res.headers['x-powered-by']).toBeUndefined();
  });

  it('lets pages load map tiles from Stadia Maps and images from nowhere else', async () => {
    const res = await request(app).get('/api/health');
    const imgSrc = (res.headers['content-security-policy'] as string)
      .split(';')
      .find((d) => d.startsWith('img-src'));
    expect(imgSrc).toBe("img-src 'self' data: https://tiles.stadiamaps.com");
    // Uploads go from the browser straight to Cloudinary; nothing else may be contacted.
    const connectSrc = (res.headers['content-security-policy'] as string)
      .split(';')
      .find((d) => d.startsWith('connect-src'));
    expect(connectSrc).toBe("connect-src 'self' https://api.cloudinary.com");
  });

  it('trusts exactly one proxy hop for the client IP', async () => {
    const probe = createApp(TEST_CONFIG);
    expect(probe.get('trust proxy')).toBe(1);
  });
});

describe('errorHandler', () => {
  it('hides the details of unexpected errors behind a generic 500', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    const boom = express();
    boom.get('/boom', () => {
      throw new Error('connection string mongodb://admin:hunter2@db');
    });
    boom.use(errorHandler);

    const res = await request(boom).get('/boom');
    expect(res.status).toBe(500);
    expect(res.body).toEqual({
      error: { code: 'INTERNAL_ERROR', message: 'Something went wrong' },
    });
    expect(JSON.stringify(res.body)).not.toContain('hunter2');
    expect(consoleError).toHaveBeenCalled();
    consoleError.mockRestore();
  });
});

describe('when the database is down', () => {
  it('health reports 503 degraded', async () => {
    await mongoose.disconnect();
    const res = await request(app).get('/api/health');
    expect(res.status).toBe(503);
    expect(res.body).toEqual({ status: 'degraded', db: 'down' });
  });
});
