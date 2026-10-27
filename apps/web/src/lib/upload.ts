import {
  MAX_FILES_PER_UPLOAD_REQUEST,
  MAX_UPLOAD_BYTES,
  UPLOAD_MIME_TYPES,
  type Photo,
  type UploadIntentResult,
} from '@tb/shared';
import { apiFetch, ApiRequestError } from './api.ts';

export type UploadStatus =
  'queued' | 'checking' | 'uploading' | 'processing' | 'done' | 'duplicate' | 'failed';

export interface UploadItem {
  key: string;
  name: string;
  status: UploadStatus;
  error?: string;
  /** A failure that may pass on another try (not a wrong type or size). */
  retryable?: boolean;
}

type Mime = (typeof UPLOAD_MIME_TYPES)[number];

const BY_EXTENSION: Record<string, Mime> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  heic: 'image/heic',
  heif: 'image/heif',
};

/** The file's type, falling back to its extension (browsers often leave HEIC untyped). */
export function photoMime(file: File): Mime | null {
  if ((UPLOAD_MIME_TYPES as readonly string[]).includes(file.type)) return file.type as Mime;
  const extension = file.name.split('.').pop()?.toLowerCase() ?? '';
  return BY_EXTENSION[extension] ?? null;
}

async function sha256Hex(file: File): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', await file.arrayBuffer());
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** Storage refused or failed an upload, with its HTTP status. */
class StorageError extends Error {
  readonly status: number;
  constructor(status: number) {
    super(status >= 500 ? 'Photo storage is not answering' : 'Upload to storage failed');
    this.name = 'StorageError';
    this.status = status;
  }
}

/**
 * A failure worth trying again: no connection, or the server or storage
 * briefly unavailable or busy. A refusal (bad file, limit reached) is not.
 */
export function isTransient(err: unknown): boolean {
  if (err instanceof TypeError) return true; // fetch's network failure
  if (err instanceof ApiRequestError || err instanceof StorageError) {
    return err.status >= 500 || err.status === 429;
  }
  return false;
}

/** Waits before the 2nd and 3rd tries; every step of an upload is safe to repeat. */
export const RETRY_DELAYS_MS = [800, 2500];

export async function withRetries<T>(
  task: () => Promise<T>,
  delays: readonly number[] = RETRY_DELAYS_MS,
): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await task();
    } catch (err) {
      const delay = delays[attempt];
      if (delay === undefined || !isTransient(err)) throw err;
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
}

function failure(err: unknown): Partial<UploadItem> {
  const offline = err instanceof TypeError;
  return {
    status: 'failed',
    error: offline ? 'Could not reach the server. Check your connection.' : (err as Error).message,
    retryable: isTransient(err),
  };
}

/** Runs tasks with at most `limit` in flight. */
async function inPool<T>(items: T[], limit: number, task: (item: T) => Promise<void>) {
  const queue = [...items];
  const workers = Array.from({ length: Math.min(limit, queue.length) }, async () => {
    for (let item = queue.shift(); item !== undefined; item = queue.shift()) await task(item);
  });
  await Promise.all(workers);
}

interface Prepared {
  key: string;
  file: File;
  mime: Mime;
  hash: string;
}

/**
 * Uploads photos to a book: checks type and size, hashes each file, announces
 * them in batches, sends each file straight to storage with the signed fields
 * the API returns, then asks the API to verify it. Each file succeeds or fails
 * on its own; `report` receives every status change.
 */
export async function uploadPhotos(
  bookId: string,
  items: { key: string; file: File }[],
  report: (key: string, patch: Partial<UploadItem>) => void,
  retryDelays: readonly number[] = RETRY_DELAYS_MS,
): Promise<void> {
  const retrying = <T>(task: () => Promise<T>) => withRetries(task, retryDelays);
  const prepared: Prepared[] = [];
  for (const { key, file } of items) {
    const mime = photoMime(file);
    if (!mime) {
      report(key, {
        status: 'failed',
        error: 'Not a supported photo (JPEG, PNG, WebP or HEIC)',
        retryable: false,
      });
    } else if (file.size > MAX_UPLOAD_BYTES) {
      report(key, { status: 'failed', error: 'Larger than 10 MB', retryable: false });
    } else if (file.size === 0) {
      report(key, { status: 'failed', error: 'The file is empty', retryable: false });
    } else {
      report(key, { status: 'checking', error: undefined, retryable: undefined });
      prepared.push({ key, file, mime, hash: await sha256Hex(file) });
    }
  }

  const toUpload: { item: Prepared; intent: Extract<UploadIntentResult, { status: 'upload' }> }[] =
    [];
  for (let i = 0; i < prepared.length; i += MAX_FILES_PER_UPLOAD_REQUEST) {
    const batch = prepared.slice(i, i + MAX_FILES_PER_UPLOAD_REQUEST);
    try {
      const { results } = await retrying(() =>
        apiFetch<{ results: UploadIntentResult[] }>(`/books/${bookId}/uploads`, {
          method: 'POST',
          json: {
            files: batch.map((p) => ({
              filename: p.file.name,
              mime: p.mime,
              bytes: p.file.size,
              clientHash: p.hash,
            })),
          },
        }),
      );
      batch.forEach((item, index) => {
        const intent = results[index];
        if (intent?.status === 'upload') toUpload.push({ item, intent });
        else report(item.key, { status: 'duplicate' });
      });
    } catch (err) {
      for (const item of batch) report(item.key, failure(err));
    }
  }

  await inPool(toUpload, 3, async ({ item, intent }) => {
    try {
      report(item.key, { status: 'uploading' });
      const { version, signature } = await retrying(async () => {
        const form = new FormData();
        for (const [name, value] of Object.entries(intent.upload.fields)) form.append(name, value);
        form.append('file', item.file);
        const stored = await fetch(intent.upload.url, {
          method: 'POST',
          body: form,
          credentials: 'omit',
        });
        if (!stored.ok) throw new StorageError(stored.status);
        return (await stored.json()) as { version: number; signature: string };
      });

      report(item.key, { status: 'processing' });
      // Confirming twice is harmless: the second answer is the photo already confirmed.
      await retrying(() =>
        apiFetch<{ photo: Photo }>(`/photos/${intent.photoId}/confirm`, {
          method: 'POST',
          json: { version, signature },
        }),
      );
      report(item.key, { status: 'done' });
    } catch (err) {
      report(item.key, failure(err));
    }
  });
}
