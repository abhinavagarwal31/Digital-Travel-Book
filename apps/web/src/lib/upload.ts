import {
  MAX_FILES_PER_UPLOAD_REQUEST,
  MAX_UPLOAD_BYTES,
  UPLOAD_MIME_TYPES,
  type Photo,
  type UploadIntentResult,
} from '@tb/shared';
import { apiFetch } from './api.ts';

export type UploadStatus =
  'queued' | 'checking' | 'uploading' | 'processing' | 'done' | 'duplicate' | 'failed';

export interface UploadItem {
  key: string;
  name: string;
  status: UploadStatus;
  error?: string;
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
): Promise<void> {
  const prepared: Prepared[] = [];
  for (const { key, file } of items) {
    const mime = photoMime(file);
    if (!mime) {
      report(key, { status: 'failed', error: 'Not a supported photo (JPEG, PNG, WebP or HEIC)' });
    } else if (file.size > MAX_UPLOAD_BYTES) {
      report(key, { status: 'failed', error: 'Larger than 10 MB' });
    } else if (file.size === 0) {
      report(key, { status: 'failed', error: 'The file is empty' });
    } else {
      report(key, { status: 'checking' });
      prepared.push({ key, file, mime, hash: await sha256Hex(file) });
    }
  }

  const toUpload: { item: Prepared; intent: Extract<UploadIntentResult, { status: 'upload' }> }[] =
    [];
  for (let i = 0; i < prepared.length; i += MAX_FILES_PER_UPLOAD_REQUEST) {
    const batch = prepared.slice(i, i + MAX_FILES_PER_UPLOAD_REQUEST);
    try {
      const { results } = await apiFetch<{ results: UploadIntentResult[] }>(
        `/books/${bookId}/uploads`,
        {
          method: 'POST',
          json: {
            files: batch.map((p) => ({
              filename: p.file.name,
              mime: p.mime,
              bytes: p.file.size,
              clientHash: p.hash,
            })),
          },
        },
      );
      batch.forEach((item, index) => {
        const intent = results[index];
        if (intent?.status === 'upload') toUpload.push({ item, intent });
        else report(item.key, { status: 'duplicate' });
      });
    } catch (err) {
      for (const item of batch)
        report(item.key, { status: 'failed', error: (err as Error).message });
    }
  }

  await inPool(toUpload, 3, async ({ item, intent }) => {
    try {
      report(item.key, { status: 'uploading' });
      const form = new FormData();
      for (const [name, value] of Object.entries(intent.upload.fields)) form.append(name, value);
      form.append('file', item.file);
      const stored = await fetch(intent.upload.url, {
        method: 'POST',
        body: form,
        credentials: 'omit',
      });
      if (!stored.ok) throw new Error('Upload to storage failed');
      const { version, signature } = (await stored.json()) as {
        version: number;
        signature: string;
      };

      report(item.key, { status: 'processing' });
      await apiFetch<{ photo: Photo }>(`/photos/${intent.photoId}/confirm`, {
        method: 'POST',
        json: { version, signature },
      });
      report(item.key, { status: 'done' });
    } catch (err) {
      report(item.key, { status: 'failed', error: (err as Error).message });
    }
  });
}
