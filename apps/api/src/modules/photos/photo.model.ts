import type { Photo, PhotoFlag } from '@tb/shared';
import { PHOTO_FLAGS } from '@tb/shared';
import mongoose, { type HydratedDocument, type Types } from 'mongoose';

export type PhotoStatus = 'pending' | 'ready' | 'failed' | 'deleting';

export interface PhotoFields {
  userId: Types.ObjectId;
  bookId: Types.ObjectId;
  schemaVersion: 1;
  originalFilename: string;
  mime: string;
  bytes: number;
  /** SHA-256 of the file. Removed when the photo is being deleted, so the same file can return. */
  contentHash?: string | undefined;
  storage: { publicId: string; version: number | null };
  status: PhotoStatus;
  failureCode: string | null;
  /** Raw EXIF exactly as read from the original. Written once, never edited. */
  exif: {
    localDateTime?: string;
    offset?: string;
    gpsDateTimeUtc?: string;
    lat?: number;
    lng?: number;
    make?: string;
    model?: string;
  };
  capturedAt: Date | null;
  localDateTime: string | null;
  timeSource: string | null;
  gps: { lat: number; lng: number } | null;
  gpsStatus: 'exif' | 'confirmed' | 'removed' | null;
  dayDate: string | null;
  assignedBy: 'auto' | 'user';
  flags: PhotoFlag[];
  caption: string;
  /** Displayed size, upright; null until confirmed (and for older photos). */
  width: number | null;
  height: number | null;
  hidden: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const photoSchema = new mongoose.Schema<PhotoFields>(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    bookId: { type: mongoose.Schema.Types.ObjectId, ref: 'Book', required: true },
    schemaVersion: { type: Number, enum: [1], default: 1 },
    originalFilename: { type: String, required: true },
    mime: { type: String, required: true },
    bytes: { type: Number, required: true },
    contentHash: { type: String },
    storage: {
      _id: false,
      publicId: { type: String, required: true },
      version: { type: Number, default: null },
    },
    status: {
      type: String,
      enum: ['pending', 'ready', 'failed', 'deleting'],
      default: 'pending',
    },
    failureCode: { type: String, default: null },
    exif: {
      _id: false,
      localDateTime: String,
      offset: String,
      gpsDateTimeUtc: String,
      lat: Number,
      lng: Number,
      make: String,
      model: String,
    },
    capturedAt: { type: Date, default: null },
    localDateTime: { type: String, default: null },
    timeSource: { type: String, default: null },
    gps: {
      type: new mongoose.Schema({ lat: Number, lng: Number }, { _id: false }),
      default: null,
    },
    gpsStatus: { type: String, enum: ['exif', 'confirmed', 'removed', null], default: null },
    dayDate: { type: String, default: null },
    assignedBy: { type: String, enum: ['auto', 'user'], default: 'auto' },
    flags: { type: [{ type: String, enum: PHOTO_FLAGS }], default: [] },
    caption: { type: String, default: '' },
    width: { type: Number, default: null },
    height: { type: Number, default: null },
    hidden: { type: Boolean, default: false },
  },
  { timestamps: true },
);

// One copy of a file per book. Partial, so photos being deleted (hash removed)
// never block the same file from being uploaded again.
photoSchema.index(
  { bookId: 1, contentHash: 1 },
  { unique: true, partialFilterExpression: { contentHash: { $exists: true } } },
);
// The book's photos in day and time order.
photoSchema.index({ bookId: 1, dayDate: 1, capturedAt: 1 });
// The sweeper finds stale uploads and unfinished deletions.
photoSchema.index({ status: 1, updatedAt: 1 });

export const PhotoModel = mongoose.model<PhotoFields>('Photo', photoSchema);

/** Storage path for one photo; the book's prefix lets one call delete a whole book. */
export function bookStoragePrefix(env: string, userId: string, bookId: string): string {
  return `tb/${env}/u/${userId}/b/${bookId}/`;
}

export function toPhotoDTO(photo: HydratedDocument<PhotoFields>): Photo {
  return {
    id: photo._id.toString(),
    bookId: photo.bookId.toString(),
    originalFilename: photo.originalFilename,
    mime: photo.mime,
    bytes: photo.bytes,
    status: photo.status === 'deleting' ? 'failed' : photo.status,
    failureCode: photo.failureCode,
    capturedAt: photo.capturedAt ? photo.capturedAt.toISOString() : null,
    localDateTime: photo.localDateTime,
    timeSource: photo.timeSource,
    gps: photo.gps ? { lat: photo.gps.lat, lng: photo.gps.lng } : null,
    gpsStatus: photo.gpsStatus,
    dayDate: photo.dayDate,
    assignedBy: photo.assignedBy,
    flags: [...photo.flags],
    camera: { make: photo.exif?.make ?? null, model: photo.exif?.model ?? null },
    caption: photo.caption,
    hidden: photo.hidden,
    width: photo.width ?? null,
    height: photo.height ?? null,
    createdAt: photo.createdAt.toISOString(),
  };
}
