import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../app.ts';

// A stand-in for apps/web/dist so these tests don't depend on a real build.
let distDir: string;
let app: ReturnType<typeof createApp>;

beforeAll(() => {
  distDir = mkdtempSync(join(tmpdir(), 'tb-web-dist-'));
  mkdirSync(join(distDir, 'assets'));
  writeFileSync(join(distDir, 'index.html'), '<!doctype html><div id="root"></div>');
  writeFileSync(join(distDir, 'assets', 'index-abc123.js'), 'console.log(1)');
  writeFileSync(join(distDir, 'favicon.svg'), '<svg/>');
  app = createApp({ webDistDir: distDir });
});

afterAll(() => rmSync(distDir, { recursive: true, force: true }));

describe('serving the web app', () => {
  it.each(['/', '/books/64b7f0c2a1d3e4f5a6b7c8d9', '/books/new/sort'])(
    'answers the client route %s with the app shell, uncached',
    async (path) => {
      const res = await request(app).get(path);
      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toMatch(/text\/html/);
      expect(res.headers['cache-control']).toBe('no-cache');
      expect(res.text).toContain('id="root"');
    },
  );

  it('caches content-hashed assets forever', async () => {
    const res = await request(app).get('/assets/index-abc123.js');
    expect(res.status).toBe(200);
    expect(res.headers['cache-control']).toBe('public, max-age=31536000, immutable');
  });

  it('revalidates other static files', async () => {
    const res = await request(app).get('/favicon.svg');
    expect(res.status).toBe(200);
    expect(res.headers['cache-control']).toBe('no-cache');
  });

  it('returns 404, not the app shell, for a missing file', async () => {
    const res = await request(app).get('/assets/missing-999.js');
    expect(res.status).toBe(404);
    expect(res.text).not.toContain('id="root"');
  });

  it('keeps unknown API routes as JSON 404s', async () => {
    const res = await request(app).get('/api/does-not-exist');
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: { code: 'NOT_FOUND', message: 'Not found' } });
  });

  it('does not serve the app shell when no build is configured', async () => {
    const res = await request(createApp()).get('/books/123');
    expect(res.status).toBe(404);
  });
});
