import { z } from 'zod';

/** Cloudinary's free-plan limit per image. */
export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
export const MAX_FILES_PER_UPLOAD_REQUEST = 50;
/** Technical safety cap (not a product entitlement). */
export const MAX_PHOTOS_PER_BOOK = 500;

export const UPLOAD_MIME_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/heic',
  'image/heif',
] as const;

const sha256Hex = z.string().regex(/^[a-f0-9]{64}$/, 'Expected a SHA-256 hex digest');

export const uploadIntentBodySchema = z.strictObject({
  files: z
    .array(
      z.strictObject({
        filename: z.string().trim().min(1).max(255),
        mime: z.enum(UPLOAD_MIME_TYPES, 'Only JPEG, PNG, WebP and HEIC photos are supported'),
        bytes: z
          .number()
          .int()
          .positive()
          .max(MAX_UPLOAD_BYTES, `Photos must be at most ${MAX_UPLOAD_BYTES / 1024 / 1024} MB`),
        clientHash: sha256Hex,
      }),
    )
    .min(1)
    .max(MAX_FILES_PER_UPLOAD_REQUEST),
});

export const confirmUploadBodySchema = z.strictObject({
  version: z.number().int().positive(),
  signature: z.string().regex(/^[a-f0-9]{40,64}$/),
});

export type UploadIntentBody = z.infer<typeof uploadIntentBodySchema>;
export type ConfirmUploadBody = z.infer<typeof confirmUploadBodySchema>;

/** One file's answer from POST /books/:bookId/uploads. */
export type UploadIntentResult =
  | {
      clientHash: string;
      photoId: string;
      status: 'upload';
      upload: { url: string; fields: Record<string, string> };
    }
  | { clientHash: string; photoId: string; status: 'duplicate' };

export const PHOTO_STATUSES = ['pending', 'ready', 'failed'] as const;
export const PHOTO_FLAGS = ['no_time', 'tz_assumed', 'outside_trip', 'gps_outlier'] as const;
export type PhotoFlag = (typeof PHOTO_FLAGS)[number];

/** A photo as the API returns it. Storage ids and the content hash never leave the server. */
export interface Photo {
  id: string;
  bookId: string;
  originalFilename: string;
  mime: string;
  bytes: number;
  status: (typeof PHOTO_STATUSES)[number];
  failureCode: string | null;
  capturedAt: string | null;
  localDateTime: string | null;
  timeSource: string | null;
  gps: { lat: number; lng: number } | null;
  gpsStatus: 'exif' | 'confirmed' | 'removed' | null;
  dayDate: string | null;
  assignedBy: 'auto' | 'user';
  flags: PhotoFlag[];
  camera: { make: string | null; model: string | null };
  caption: string;
  hidden: boolean;
  /** As displayed (sideways photos already turned upright); null for photos from before this was recorded. */
  width: number | null;
  height: number | null;
  createdAt: string;
}
