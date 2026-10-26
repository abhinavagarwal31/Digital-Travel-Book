import { createHash } from 'node:crypto';
import { readCapped, StorageError, type ImageStorage, type ImageVariant } from '../lib/storage.ts';

const SECRET = 'fake-storage-secret';

function sign(publicId: string, version: number): string {
  return createHash('sha1')
    .update(`public_id=${publicId}&version=${version}${SECRET}`)
    .digest('hex');
}

type Operation = 'fetchOriginal' | 'fetchVariant' | 'destroy' | 'destroyPrefix';

/**
 * In-memory stand-in for Cloudinary with the same contract. Tests "upload"
 * through simulateUpload, which returns what Cloudinary would hand the browser.
 */
export class FakeStorage implements ImageStorage {
  readonly assets = new Map<string, { bytes: Buffer; version: number }>();
  private nextVersion = 1_700_000_000;
  private failing = new Set<Operation>();

  /** Makes every call of the operation throw until healed. */
  fail(operation: Operation): void {
    this.failing.add(operation);
  }

  heal(): void {
    this.failing.clear();
  }

  private check(operation: Operation): void {
    if (this.failing.has(operation)) throw new StorageError(`${operation} unavailable`);
  }

  simulateUpload(publicId: string, bytes: Buffer): { version: number; signature: string } {
    const version = this.nextVersion++;
    this.assets.set(publicId, { bytes, version });
    return { version, signature: sign(publicId, version) };
  }

  signUpload(publicId: string) {
    return {
      url: 'https://storage.invalid/upload',
      fields: { public_id: publicId, signature: 'fake', api_key: 'fake', timestamp: '1' },
    };
  }

  verifyUploadSignature(publicId: string, version: number, signature: string): boolean {
    return signature === sign(publicId, version);
  }

  async fetchOriginal(publicId: string, version: number, maxBytes: number): Promise<Buffer> {
    this.check('fetchOriginal');
    const asset = this.assets.get(publicId);
    if (!asset || asset.version !== version) throw new StorageError('Storage answered 404');
    return readCapped(new Response(asset.bytes), maxBytes);
  }

  async fetchVariant(publicId: string, version: number, variant: ImageVariant): Promise<Response> {
    this.check('fetchVariant');
    const asset = this.assets.get(publicId);
    if (!asset || asset.version !== version) throw new StorageError('Storage answered 404');
    return new Response(`variant:${variant}:${publicId}`, {
      headers: { 'Content-Type': 'image/webp', 'X-Storage-Internal': 'cloud-name-here' },
    });
  }

  async destroy(publicId: string): Promise<void> {
    this.check('destroy');
    this.assets.delete(publicId);
  }

  async destroyPrefix(prefix: string): Promise<void> {
    this.check('destroyPrefix');
    for (const id of [...this.assets.keys()]) if (id.startsWith(prefix)) this.assets.delete(id);
  }
}
