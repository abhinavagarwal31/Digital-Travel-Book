// Real-account checks for Cloudinary (plan item C6). Skipped unless explicitly
// enabled; run with `npm run test:integration`, which loads .env.production.local.
// Everything is created under a throwaway tb/test/integration-<run>/ path and deleted.
import { MAX_UPLOAD_BYTES } from '@tb/shared';
import { v2 as cloudinary } from 'cloudinary';
import { createHash, randomBytes } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { readExif } from '../modules/photos/metadata.ts';
import { makeJpeg } from '../test/makeJpeg.ts';
import { createCloudinaryStorage } from './cloudinaryStorage.ts';
import { FileTooLargeError, type ImageStorage } from './storage.ts';

const enabled =
  process.env.RUN_CLOUDINARY_INTEGRATION === '1' && Boolean(process.env.CLOUDINARY_API_SECRET);

const KYOTO = { lat: 35.0116, lng: 135.7681 };
const sha256 = (bytes: Buffer) => createHash('sha256').update(bytes).digest('hex');

describe.skipIf(!enabled)('Cloudinary storage against the real account', () => {
  const cloudName = process.env.CLOUDINARY_CLOUD_NAME ?? '';
  const prefix = `tb/test/integration-${randomBytes(4).toString('hex')}/`;
  let storage: ImageStorage;

  const photo = makeJpeg({
    width: 320,
    height: 240,
    scene: [
      [90, 150, 220],
      [190, 220, 240],
      [80, 120, 70],
    ],
    exif: {
      dateTimeOriginal: '2026:10:12 17:42:10',
      offsetTimeOriginal: '+09:00',
      gps: KYOTO,
      make: 'Apple',
      model: 'iPhone 15',
    },
  });

  /** Exactly what the browser does with the fields the API hands out. */
  async function browserUpload(publicId: string, bytes: Buffer) {
    const { url, fields } = storage.signUpload(publicId);
    const form = new FormData();
    for (const [name, value] of Object.entries(fields)) form.append(name, value);
    form.append('file', new Blob([new Uint8Array(bytes)], { type: 'image/jpeg' }), 'IMG_TEST.JPG');
    const res = await fetch(url, { method: 'POST', body: form });
    const body = (await res.json()) as Record<string, unknown>;
    if (!res.ok) throw new Error(`upload refused (${res.status}): ${JSON.stringify(body.error)}`);
    return body as { public_id: string; version: number; signature: string; type: string };
  }

  beforeAll(() => {
    storage = createCloudinaryStorage({
      cloudName,
      apiKey: process.env.CLOUDINARY_API_KEY ?? '',
      apiSecret: process.env.CLOUDINARY_API_SECRET ?? '',
    });
  });

  afterAll(async () => {
    await storage.destroyPrefix(prefix).catch(() => undefined);
  });

  it('accepts the credentials (Admin API ping)', async () => {
    const res = await cloudinary.api.ping();
    expect(res.status).toBe('ok');
    console.info(
      `Admin API rate limit: ${res.rate_limit_remaining} of ${res.rate_limit_allowed} left this hour`,
    );
  });

  it('runs the whole upload path privately and strips metadata from what browsers get', async () => {
    const publicId = `${prefix}photo`;
    const stored = await browserUpload(publicId, photo);

    // Stored exactly where and how we signed it.
    expect(stored.public_id).toBe(publicId);
    expect(stored.type).toBe('authenticated');

    // Cloudinary's response signature verifies, and a tampered version does not.
    expect(storage.verifyUploadSignature(publicId, stored.version, stored.signature)).toBe(true);
    expect(storage.verifyUploadSignature(publicId, stored.version + 1, stored.signature)).toBe(
      false,
    );

    // The original comes back byte for byte, metadata intact, for the server to read.
    const original = await storage.fetchOriginal(publicId, stored.version, MAX_UPLOAD_BYTES);
    expect(sha256(original)).toBe(sha256(photo));
    const exif = await readExif(original);
    expect(exif).toMatchObject({ localDateTime: '2026-10-12T17:42:10', offset: '+09:00' });
    expect(exif.lat).toBeCloseTo(KYOTO.lat, 4);

    // Oversized originals are refused while downloading, not after.
    await expect(storage.fetchOriginal(publicId, stored.version, 100)).rejects.toBeInstanceOf(
      FileTooLargeError,
    );

    // What browsers receive: a WebP rendition with no EXIF chunk.
    const variant = Buffer.from(
      await (await storage.fetchVariant(publicId, stored.version, 'thumb')).arrayBuffer(),
    );
    expect(variant.toString('latin1', 0, 4)).toBe('RIFF');
    expect(variant.toString('latin1', 8, 12)).toBe('WEBP');
    expect(variant.includes(Buffer.from('EXIF'))).toBe(false);

    // Same transformation as JPEG, read back with our EXIF reader: no time, no place.
    const jpegVariantUrl = cloudinary.url(publicId, {
      type: 'authenticated',
      sign_url: true,
      secure: true,
      version: stored.version,
      transformation: [{ width: 400, crop: 'limit', quality: 'auto' }],
      format: 'jpg',
    });
    const jpegVariant = Buffer.from(await (await fetch(jpegVariantUrl)).arrayBuffer());
    const stripped = await readExif(jpegVariant);
    expect(stripped.lat).toBeUndefined();
    expect(stripped.localDateTime).toBeUndefined();

    // Without our signature the image cannot be fetched, as authenticated or as public.
    for (const deliveryType of ['authenticated', 'upload']) {
      const unsigned = `https://res.cloudinary.com/${cloudName}/image/${deliveryType}/v${stored.version}/${publicId}.jpg`;
      expect((await fetch(unsigned)).ok).toBe(false);
    }

    // Deleting removes the asset; deleting again is harmless.
    await storage.destroy(publicId);
    await expect(
      cloudinary.api.resource(publicId, { type: 'authenticated', resource_type: 'image' }),
    ).rejects.toMatchObject({ error: { http_code: 404 } });
    await expect(storage.destroy(publicId)).resolves.toBeUndefined();

    const afterDelete = await fetch(jpegVariantUrl);
    console.info(
      `Signed rendition after deletion: HTTP ${afterDelete.status} (CDN invalidation can take a little while)`,
    );
  }, 120_000);

  it('deletes a whole book by prefix', async () => {
    const book = `${prefix}book/`;
    await browserUpload(`${book}a`, photo);
    await browserUpload(`${book}b`, makeJpeg({ rgb: [10, 120, 200] }));

    await storage.destroyPrefix(book);
    const left = await cloudinary.api.resources({
      type: 'authenticated',
      resource_type: 'image',
      prefix: book,
    });
    expect(left.resources).toEqual([]);
  }, 120_000);
});
