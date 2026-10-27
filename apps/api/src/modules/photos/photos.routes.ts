import {
  captureFields,
  confirmUploadBodySchema,
  MAX_PHOTOS_PER_BOOK,
  MAX_UPLOAD_BYTES,
  uploadIntentBodySchema,
  type ConfirmUploadBody,
  type UploadIntentBody,
  type UploadIntentResult,
} from '@tb/shared';
import express, { type Router } from 'express';
import mongoose, { type HydratedDocument } from 'mongoose';
import { createHash } from 'node:crypto';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { AppError } from '../../lib/errors.ts';
import { findOwned, notFound, pathParam } from '../../lib/ownership.ts';
import {
  FileTooLargeError,
  IMAGE_VARIANTS,
  type ImageStorage,
  type ImageVariant,
} from '../../lib/storage.ts';
import { timeZoneAt } from '../../lib/timeZoneAt.ts';
import { validateBody } from '../../lib/validate.ts';
import { authUserId, requireAuth } from '../auth/requireAuth.ts';
import type { SessionConfig } from '../auth/session.ts';
import { BookModel } from '../books/book.model.ts';
import { readExif, sniffImageType } from './metadata.ts';
import { bookStoragePrefix, PhotoModel, toPhotoDTO, type PhotoFields } from './photo.model.ts';

export interface PhotosRouterConfig extends SessionConfig {
  storage: ImageStorage | null;
  /** Keeps development, test and production assets apart in one storage account. */
  storageNamespace: string;
}

const ACTIVE_BOOK = { state: 'active' as const };

function isDuplicateKeyError(err: unknown): boolean {
  return err instanceof mongoose.mongo.MongoServerError && err.code === 11000;
}

export function createPhotosRouter(config: PhotosRouterConfig): Router {
  const router = express.Router();
  const auth = requireAuth(config);

  function storageOrFail(): ImageStorage {
    if (!config.storage) {
      throw new AppError(
        503,
        'STORAGE_NOT_CONFIGURED',
        'Photo storage is not set up on this server',
      );
    }
    return config.storage;
  }

  /**
   * Step 1 of an upload. For each file the browser describes, either reports
   * that the book already has it, or returns one-off signed fields to upload it
   * straight to storage. Records are keyed by content hash, so retries and
   * repeated files never create duplicates.
   */
  router.post(
    '/books/:bookId/uploads',
    auth,
    validateBody(uploadIntentBodySchema),
    async (req, res) => {
      const storage = storageOrFail();
      const userId = authUserId(req);
      const book = await findOwned(BookModel, pathParam(req, 'bookId'), userId, ACTIVE_BOOK);
      const { files } = req.body as UploadIntentBody;

      const unique = new Map(files.map((file) => [file.clientHash, file]));
      const existing = await PhotoModel.find({
        bookId: book._id,
        contentHash: { $in: [...unique.keys()] },
      });
      const byHash = new Map(existing.map((photo) => [photo.contentHash, photo]));

      const newFiles = [...unique.keys()].filter((hash) => !byHash.has(hash)).length;
      const current = await PhotoModel.countDocuments({
        bookId: book._id,
        status: { $ne: 'deleting' },
      });
      if (current + newFiles > MAX_PHOTOS_PER_BOOK) {
        throw new AppError(
          409,
          'PHOTO_LIMIT',
          `A book can hold at most ${MAX_PHOTOS_PER_BOOK} photos`,
          { remaining: Math.max(0, MAX_PHOTOS_PER_BOOK - current) },
        );
      }

      const results = new Map<string, UploadIntentResult>();
      for (const file of unique.values()) {
        let photo: HydratedDocument<PhotoFields> | null = byHash.get(file.clientHash) ?? null;
        if (!photo) {
          const id = new mongoose.Types.ObjectId();
          const publicId = `${bookStoragePrefix(config.storageNamespace, userId, book.id)}${id}`;
          try {
            photo = await PhotoModel.create({
              _id: id,
              userId,
              bookId: book._id,
              originalFilename: file.filename,
              mime: file.mime, // replaced by the sniffed type at confirm
              bytes: file.bytes, // replaced by the real size at confirm
              contentHash: file.clientHash,
              storage: { publicId, version: null },
            });
          } catch (err) {
            // A parallel request just created the same file; use its record.
            if (!isDuplicateKeyError(err)) throw err;
            photo = await PhotoModel.findOne({ bookId: book._id, contentHash: file.clientHash });
            if (!photo) throw err;
          }
        }

        if (photo.status === 'ready') {
          results.set(file.clientHash, {
            clientHash: file.clientHash,
            photoId: photo.id,
            status: 'duplicate',
          });
          continue;
        }
        if (photo.status === 'failed') {
          await PhotoModel.updateOne(
            { _id: photo._id, status: 'failed' },
            { $set: { status: 'pending', failureCode: null } },
          );
        }
        results.set(file.clientHash, {
          clientHash: file.clientHash,
          photoId: photo.id,
          status: 'upload',
          upload: storage.signUpload(photo.storage.publicId),
        });
      }

      res.json({ results: files.map((file) => results.get(file.clientHash)) });
    },
  );

  /**
   * Step 2, after the browser has uploaded. Nothing the browser says about the
   * file is trusted: the server verifies storage's signature, downloads the
   * original, checks its real type, size and hash, and reads EXIF from those
   * bytes before any transformation can strip it.
   */
  router.post(
    '/photos/:photoId/confirm',
    auth,
    validateBody(confirmUploadBodySchema),
    async (req, res) => {
      const storage = storageOrFail();
      const userId = authUserId(req);
      const photo = await findOwned(PhotoModel, pathParam(req, 'photoId'), userId, {
        status: { $in: ['pending', 'ready'] },
      });
      if (photo.status === 'ready') {
        res.json({ photo: toPhotoDTO(photo) });
        return;
      }
      const book = await findOwned(BookModel, photo.bookId.toString(), userId, ACTIVE_BOOK);
      const { version, signature } = req.body as ConfirmUploadBody;

      // Signed over the id the server chose, so one upload cannot confirm another photo.
      if (!storage.verifyUploadSignature(photo.storage.publicId, version, signature)) {
        throw new AppError(400, 'INVALID_UPLOAD_SIGNATURE', 'The upload could not be verified');
      }

      const reject = async (code: string, message: string): Promise<never> => {
        await PhotoModel.updateOne(
          { _id: photo._id, status: 'pending' },
          { $set: { status: 'failed', failureCode: code } },
        );
        // Best effort: the sweeper retries assets left behind by failed uploads.
        await storage.destroy(photo.storage.publicId).catch(() => undefined);
        throw new AppError(422, code, message);
      };

      let bytes: Buffer;
      try {
        bytes = await storage.fetchOriginal(photo.storage.publicId, version, MAX_UPLOAD_BYTES);
      } catch (err) {
        if (err instanceof FileTooLargeError) {
          return reject('TOO_LARGE', 'Photos must be at most 10 MB');
        }
        // Leave it pending: confirming again once storage answers will succeed.
        throw new AppError(502, 'STORAGE_UNAVAILABLE', 'Could not reach photo storage. Try again.');
      }

      const mime = sniffImageType(bytes);
      if (!mime) return reject('UNSUPPORTED_TYPE', 'This file is not a supported photo');
      const hash = createHash('sha256').update(bytes).digest('hex');
      if (hash !== photo.contentHash) {
        return reject('HASH_MISMATCH', 'The uploaded file is not the one that was announced');
      }

      const exif = await readExif(bytes);
      const fields = captureFields(exif, book, timeZoneAt);
      const updated = await PhotoModel.findOneAndUpdate(
        { _id: photo._id, userId, status: 'pending' },
        {
          $set: {
            status: 'ready',
            failureCode: null,
            mime,
            bytes: bytes.length,
            'storage.version': version,
            exif,
            capturedAt: fields.capturedAt ? new Date(fields.capturedAt) : null,
            localDateTime: fields.localDateTime,
            timeSource: fields.timeSource,
            gps: fields.gps,
            gpsStatus: fields.gps ? 'exif' : null,
            dayDate: fields.dayDate,
            assignedBy: 'auto',
            flags: fields.flags,
          },
        },
        { returnDocument: 'after' },
      );
      // A concurrent confirm got there first; answer with the stored result.
      const result = updated ?? (await findOwned(PhotoModel, photo.id, userId));
      res.json({ photo: toPhotoDTO(result) });
    },
  );

  router.get('/books/:bookId/photos', auth, async (req, res) => {
    const userId = authUserId(req);
    const book = await findOwned(BookModel, pathParam(req, 'bookId'), userId, ACTIVE_BOOK);
    const photos = await PhotoModel.find({
      bookId: book._id,
      userId,
      status: { $ne: 'deleting' },
    }).sort({ dayDate: 1, capturedAt: 1, createdAt: 1 });
    res.json({ photos: photos.map(toPhotoDTO) });
  });

  /**
   * The only way an image reaches a browser: ownership is checked with the
   * session cookie, the signed storage URL is built and fetched here, and only
   * the bytes and their type are passed on. Nothing is cached anywhere.
   */
  router.get('/photos/:photoId/image/:variant', auth, async (req, res) => {
    const variant = pathParam(req, 'variant');
    if (!Object.hasOwn(IMAGE_VARIANTS, variant)) throw notFound();
    const storage = storageOrFail();
    const photo = await findOwned(PhotoModel, pathParam(req, 'photoId'), authUserId(req), {
      status: 'ready',
    });

    let upstream: Response;
    try {
      upstream = await storage.fetchVariant(
        photo.storage.publicId,
        photo.storage.version ?? 0,
        variant as ImageVariant,
      );
    } catch {
      throw new AppError(502, 'IMAGE_UNAVAILABLE', 'Could not load this image');
    }
    const type = upstream.headers.get('content-type') ?? '';
    if (!type.startsWith('image/') || !upstream.body) {
      throw new AppError(502, 'IMAGE_UNAVAILABLE', 'Could not load this image');
    }

    // Copy only what the browser needs; storage headers may name the account.
    res.status(200);
    res.setHeader('Content-Type', type);
    res.setHeader('Cache-Control', 'private, no-store');
    const length = upstream.headers.get('content-length');
    if (length) res.setHeader('Content-Length', length);
    try {
      await pipeline(Readable.fromWeb(upstream.body), res);
    } catch {
      // The browser went away mid-image; nothing left to answer.
    }
  });

  /**
   * Hides the photo at once, then removes the stored image and the record.
   * If storage is down, the photo stays hidden in "deleting" and the sweeper
   * finishes later. Its content hash is cleared so the same file can be added again.
   */
  router.delete('/photos/:photoId', auth, async (req, res) => {
    const userId = authUserId(req);
    const photo = await findOwned(PhotoModel, pathParam(req, 'photoId'), userId, {
      status: { $ne: 'deleting' },
    });
    await PhotoModel.updateOne(
      { _id: photo._id, userId },
      { $set: { status: 'deleting' }, $unset: { contentHash: 1 } },
    );
    // A deleted photo stops being the cover (the book would ignore it anyway).
    await BookModel.updateOne(
      { _id: photo.bookId, userId, 'overrides.coverPhotoId': photo.id },
      { $set: { 'overrides.coverPhotoId': null } },
    );
    if (config.storage) {
      try {
        await config.storage.destroy(photo.storage.publicId);
        await PhotoModel.deleteOne({ _id: photo._id, status: 'deleting' });
      } catch {
        // Left for the sweeper.
      }
    }
    res.status(204).end();
  });

  return router;
}
