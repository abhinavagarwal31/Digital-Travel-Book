import type { Photo } from '@tb/shared';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { groupByDay } from './photos.ts';
import { photoMime, uploadPhotos, type UploadItem } from './upload.ts';

afterEach(() => vi.unstubAllGlobals());

const jpeg = (name: string, body = name) => new File([body], name, { type: 'image/jpeg' });

/** A fake API + storage, answering by URL, recording calls. */
function fakeServer(options: { duplicateHashes?: string[]; failStorageFor?: string } = {}) {
  const calls: { url: string; body?: unknown }[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init?: RequestInit) => {
      if (url === '/api/books/b1/uploads') {
        const body = JSON.parse(String(init?.body)) as {
          files: { clientHash: string; filename: string }[];
        };
        calls.push({ url, body });
        return Response.json({
          results: body.files.map((f, i) =>
            options.duplicateHashes?.includes(f.clientHash)
              ? { clientHash: f.clientHash, photoId: `p${i}`, status: 'duplicate' }
              : {
                  clientHash: f.clientHash,
                  photoId: `p-${f.filename}`,
                  status: 'upload',
                  upload: { url: 'https://storage.test/upload', fields: { public_id: f.filename } },
                },
          ),
        });
      }
      if (url === 'https://storage.test/upload') {
        const form = init?.body as FormData;
        const id = String(form.get('public_id'));
        calls.push({ url, body: id });
        if (id === options.failStorageFor) return new Response('nope', { status: 500 });
        return Response.json({ version: 1, signature: 'a'.repeat(40) });
      }
      if (url.endsWith('/confirm')) {
        calls.push({ url, body: JSON.parse(String(init?.body)) });
        return Response.json({ photo: {} });
      }
      return new Response(null, { status: 404 });
    }),
  );
  return calls;
}

async function run(files: File[]) {
  const states = new Map<string, Partial<UploadItem>>();
  await uploadPhotos(
    'b1',
    files.map((file, i) => ({ key: String(i), file })),
    (key, patch) => states.set(key, { ...states.get(key), ...patch }),
  );
  return files.map((_, i) => states.get(String(i)));
}

describe('photoMime', () => {
  it('uses the browser type, or the extension when the type is missing', () => {
    expect(photoMime(jpeg('a.jpg'))).toBe('image/jpeg');
    expect(photoMime(new File(['x'], 'IMG_0001.HEIC', { type: '' }))).toBe('image/heic');
    expect(photoMime(new File(['x'], 'notes.pdf', { type: 'application/pdf' }))).toBeNull();
  });
});

describe('uploadPhotos', () => {
  it('hashes, announces, uploads with the signed fields, then confirms', async () => {
    const calls = fakeServer();
    const [state] = await run([jpeg('IMG_1.JPG', 'pixels')]);

    expect(state?.status).toBe('done');
    const announce = calls[0]?.body as { files: { clientHash: string; bytes: number }[] };
    // SHA-256 of "pixels", computed in the browser.
    expect(announce.files[0]?.clientHash).toBe(
      '6ec9c2b0eb14010746c8bce8939303b382344b296206612eb8a907a37b2b2f37',
    );
    expect(announce.files[0]?.bytes).toBe(6);
    expect(calls.map((c) => c.url)).toEqual([
      '/api/books/b1/uploads',
      'https://storage.test/upload',
      '/api/photos/p-IMG_1.JPG/confirm',
    ]);
    expect(calls[2]?.body).toEqual({ version: 1, signature: 'a'.repeat(40) });
  });

  it('rejects unsupported and oversized files without contacting the server', async () => {
    const calls = fakeServer();
    const huge = new File([new Uint8Array(10 * 1024 * 1024 + 1)], 'big.jpg', {
      type: 'image/jpeg',
    });
    const [pdf, big] = await run([new File(['x'], 'trip.pdf', { type: 'application/pdf' }), huge]);
    expect(pdf).toMatchObject({ status: 'failed' });
    expect(big).toMatchObject({ status: 'failed', error: 'Larger than 10 MB' });
    expect(calls).toEqual([]);
  });

  it('marks duplicates without uploading them', async () => {
    const hash = [
      ...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode('same'))),
    ]
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
    const calls = fakeServer({ duplicateHashes: [hash] });
    const [state] = await run([jpeg('again.jpg', 'same')]);
    expect(state?.status).toBe('duplicate');
    expect(calls.map((c) => c.url)).toEqual(['/api/books/b1/uploads']);
  });

  it('lets one failed file fail alone', async () => {
    fakeServer({ failStorageFor: 'b.jpg' });
    const states = await run([jpeg('a.jpg'), jpeg('b.jpg'), jpeg('c.jpg')]);
    expect(states.map((s) => s?.status)).toEqual(['done', 'failed', 'done']);
  });

  it('announces in batches of at most 50', async () => {
    const calls = fakeServer();
    await run(Array.from({ length: 120 }, (_, i) => jpeg(`p${i}.jpg`)));
    const announces = calls.filter((c) => c.url.endsWith('/uploads'));
    expect(announces.map((c) => (c.body as { files: unknown[] }).files.length)).toEqual([
      50, 50, 20,
    ]);
  });
});

describe('groupByDay', () => {
  const photo = (id: string, dayDate: string | null, time: string | null, status = 'ready') =>
    ({ id, dayDate, localDateTime: time, status }) as unknown as Photo;

  it('orders days, puts undated photos last and sorts each day by time', () => {
    const groups = groupByDay([
      photo('c', '2026-10-12', '2026-10-12T18:00:00'),
      photo('x', null, null),
      photo('a', '2026-10-11', '2026-10-11T09:00:00'),
      photo('b', '2026-10-12', '2026-10-12T08:00:00'),
      photo('d', '2026-10-12', null),
      photo('p', '2026-10-12', '2026-10-12T07:00:00', 'pending'),
    ]);
    expect(groups.map((g) => [g.dayDate, g.photos.map((p) => p.id)])).toEqual([
      ['2026-10-11', ['a']],
      ['2026-10-12', ['b', 'c', 'd']],
      [null, ['x']],
    ]);
  });
});
