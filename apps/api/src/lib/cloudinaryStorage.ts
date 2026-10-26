import { v2 as cloudinary } from 'cloudinary';
import { timingSafeEqual } from 'node:crypto';
import {
  IMAGE_VARIANTS,
  readCapped,
  StorageError,
  type ImageStorage,
  type ImageVariant,
} from './storage.ts';

export interface CloudinaryCredentials {
  cloudName: string;
  apiKey: string;
  apiSecret: string;
}

const ALLOWED_FORMATS = 'jpg,jpeg,png,webp,heic,heif';
const AUTHENTICATED = { type: 'authenticated', resource_type: 'image' } as const;

/**
 * Cloudinary with "authenticated" delivery: every URL needs our signature, and
 * signed URLs are only ever built and fetched here on the server.
 *
 * Not yet verified against a real account (needs credentials): signature
 * algorithm, extension-less original URLs, metadata stripping on variants,
 * and deletion of derived assets are checked by the integration test.
 */
export function createCloudinaryStorage(credentials: CloudinaryCredentials): ImageStorage {
  cloudinary.config({
    cloud_name: credentials.cloudName,
    api_key: credentials.apiKey,
    api_secret: credentials.apiSecret,
    secure: true,
  });

  const signedUrl = (publicId: string, version: number, extra: object = {}) =>
    cloudinary.url(publicId, { ...AUTHENTICATED, sign_url: true, secure: true, version, ...extra });

  async function get(url: string): Promise<Response> {
    const res = await fetch(url);
    if (!res.ok) throw new StorageError(`Storage answered ${res.status}`);
    return res;
  }

  return {
    signUpload(publicId) {
      const params = {
        public_id: publicId,
        timestamp: String(Math.round(Date.now() / 1000)),
        type: AUTHENTICATED.type,
        allowed_formats: ALLOWED_FORMATS,
        // A retry re-uploads to the same id, replacing a half-finished attempt.
        overwrite: 'true',
      };
      const signature = cloudinary.utils.api_sign_request(params, credentials.apiSecret);
      return {
        url: `https://api.cloudinary.com/v1_1/${credentials.cloudName}/image/upload`,
        fields: { ...params, api_key: credentials.apiKey, signature },
      };
    },

    verifyUploadSignature(publicId, version, signature) {
      const expected = cloudinary.utils.api_sign_request(
        { public_id: publicId, version },
        credentials.apiSecret,
      );
      const a = Buffer.from(expected);
      const b = Buffer.from(signature);
      return a.length === b.length && timingSafeEqual(a, b);
    },

    async fetchOriginal(publicId, version, maxBytes) {
      return readCapped(await get(signedUrl(publicId, version)), maxBytes);
    },

    async fetchVariant(publicId, version, variant: ImageVariant) {
      return get(
        signedUrl(publicId, version, {
          transformation: [{ width: IMAGE_VARIANTS[variant], crop: 'limit', quality: 'auto' }],
          format: 'webp',
        }),
      );
    },

    async destroy(publicId) {
      const result = await cloudinary.uploader.destroy(publicId, {
        ...AUTHENTICATED,
        invalidate: true,
      });
      if (result.result !== 'ok' && result.result !== 'not found') {
        throw new StorageError(`Delete failed: ${String(result.result)}`);
      }
    },

    async destroyPrefix(prefix) {
      // Each call deletes up to 1000 assets and reports `partial` while more remain.
      for (let round = 0; round < 50; round++) {
        const result = await cloudinary.api.delete_resources_by_prefix(prefix, {
          ...AUTHENTICATED,
          invalidate: true,
        });
        if (!result.partial) return;
      }
      throw new StorageError('Prefix delete did not finish');
    },
  };
}
