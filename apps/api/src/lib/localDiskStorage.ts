import type { Express, Request, Response as ExpressResponse } from 'express';
import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { dirname, join, resolve, sep } from 'node:path';
import { Readable } from 'node:stream';
import { sniffImageType } from '../modules/photos/metadata.ts';
import { FileTooLargeError, StorageError, type ImageStorage } from './storage.ts';

/** Where the browser posts files when local storage is active. Outside /api on purpose. */
export const LOCAL_UPLOAD_PATH = '/dev-storage/upload';

const MAX_LOCAL_UPLOAD = 11 * 1024 * 1024; // a little over the 10 MB photo limit
const PUBLIC_ID = /^[A-Za-z0-9_-]+(?:\/[A-Za-z0-9_-]+)*$/;

/**
 * DEVELOPMENT ONLY. Stands in for Cloudinary while no account exists, so the
 * real upload flow can be used end to end on one machine. It speaks the same
 * protocol (signed multipart upload, signed response) but stores files on
 * disk and serves "variants" as the untouched original, so it neither resizes
 * nor strips metadata. The server refuses it in production.
 */
export class LocalDiskStorage implements ImageStorage {
  private readonly root: string;
  private readonly secret = randomBytes(32).toString('hex');

  constructor(root: string) {
    this.root = resolve(root);
  }

  private pathFor(publicId: string): string {
    if (!PUBLIC_ID.test(publicId)) throw new StorageError('Invalid storage id');
    const path = resolve(this.root, publicId);
    if (!path.startsWith(this.root + sep)) throw new StorageError('Invalid storage id');
    return path;
  }

  private hmac(value: string): string {
    return createHmac('sha256', this.secret).update(value).digest('hex');
  }

  private responseSignature(publicId: string, version: number): string {
    return createHash('sha1')
      .update(`public_id=${publicId}&version=${version}${this.secret}`)
      .digest('hex');
  }

  signUpload(publicId: string) {
    const timestamp = String(Math.round(Date.now() / 1000));
    return {
      url: LOCAL_UPLOAD_PATH,
      fields: { public_id: publicId, timestamp, signature: this.hmac(`${publicId}:${timestamp}`) },
    };
  }

  verifyUploadSignature(publicId: string, version: number, signature: string): boolean {
    const a = Buffer.from(this.responseSignature(publicId, version));
    const b = Buffer.from(signature);
    return a.length === b.length && timingSafeEqual(a, b);
  }

  async fetchOriginal(publicId: string, _version: number, maxBytes: number): Promise<Buffer> {
    const path = this.pathFor(publicId);
    const info = await stat(path).catch(() => null);
    if (!info) throw new StorageError('Not found');
    if (info.size > maxBytes) throw new FileTooLargeError();
    return readFile(path);
  }

  async fetchVariant(publicId: string): Promise<Response> {
    const bytes = await readFile(this.pathFor(publicId)).catch(() => null);
    if (!bytes) throw new StorageError('Not found');
    const type = sniffImageType(bytes) ?? 'application/octet-stream';
    return new Response(new Uint8Array(bytes), { headers: { 'Content-Type': type } });
  }

  async destroy(publicId: string): Promise<void> {
    await rm(this.pathFor(publicId), { force: true });
  }

  async destroyPrefix(prefix: string): Promise<void> {
    await rm(this.pathFor(prefix.replace(/\/+$/, '')), { recursive: true, force: true });
  }

  /** The upload endpoint the browser posts to, answering like Cloudinary does. */
  mount(app: Express): void {
    app.post(LOCAL_UPLOAD_PATH, (req, res) => {
      this.handleUpload(req, res).catch((err: unknown) => {
        res.status(400).json({ error: { message: (err as Error).message } });
      });
    });
  }

  private async handleUpload(req: Request, res: ExpressResponse): Promise<void> {
    const declared = Number(req.headers['content-length']);
    if (!Number.isFinite(declared) || declared > MAX_LOCAL_UPLOAD) {
      throw new Error('File too large');
    }
    const form = await new globalThis.Request('http://local/upload', {
      method: 'POST',
      headers: { 'content-type': req.headers['content-type'] ?? '' },
      body: Readable.toWeb(req) as ReadableStream,
      duplex: 'half',
    } as RequestInit).formData();

    const publicId = String(form.get('public_id') ?? '');
    const timestamp = String(form.get('timestamp') ?? '');
    const signature = String(form.get('signature') ?? '');
    const file = form.get('file');
    const expected = Buffer.from(this.hmac(`${publicId}:${timestamp}`));
    const given = Buffer.from(signature);
    if (expected.length !== given.length || !timingSafeEqual(expected, given)) {
      throw new Error('Invalid signature');
    }
    if (Date.now() / 1000 - Number(timestamp) > 3600) throw new Error('Signature expired');
    if (!(file instanceof Blob)) throw new Error('Missing file');

    const path = this.pathFor(publicId);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, Buffer.from(await file.arrayBuffer()));

    const version = Math.round(Date.now() / 1000);
    res.json({
      public_id: publicId,
      version,
      signature: this.responseSignature(publicId, version),
    });
  }
}

/** <repo>/.local-storage, wherever the server is started from. Git-ignored. */
export const LOCAL_STORAGE_ROOT = join(
  new URL('../../../../', import.meta.url).pathname,
  '.local-storage',
);
