import { useQueryClient } from '@tanstack/react-query';
import { useRef, useState, type DragEvent } from 'react';
import { photosKey } from '../lib/photos.ts';
import { useSorting } from '../lib/sorting.ts';
import { uploadPhotos, type UploadItem, type UploadStatus } from '../lib/upload.ts';

const LABELS: Record<UploadStatus, string> = {
  queued: 'Waiting',
  checking: 'Checking',
  uploading: 'Uploading',
  processing: 'Reading details',
  done: 'Added',
  duplicate: 'Already in this book',
  failed: 'Failed',
};

let nextKey = 0;

export function PhotoUploader({ bookId }: { bookId: string }) {
  const queryClient = useQueryClient();
  const { organize } = useSorting(bookId);
  const input = useRef<HTMLInputElement>(null);
  const [items, setItems] = useState<UploadItem[]>([]);
  const [dragging, setDragging] = useState(false);
  // The files themselves, kept so a failed upload can be tried again.
  const files = useRef(new Map<string, File>());
  const busy = items.some((i) => !['done', 'duplicate', 'failed'].includes(i.status));

  async function start(chosen: File[]) {
    if (chosen.length === 0) return;
    const batch = chosen.map((file) => ({ key: String(nextKey++), file }));
    for (const { key, file } of batch) files.current.set(key, file);
    setItems((current) => [
      ...current.filter((i) => !['done', 'duplicate'].includes(i.status)),
      ...batch.map(({ key, file }) => ({ key, name: file.name, status: 'queued' as const })),
    ]);
    await upload(batch);
  }

  async function retryFailed() {
    const batch = items
      .filter((i) => i.status === 'failed' && i.retryable)
      .flatMap((i) => {
        const file = files.current.get(i.key);
        return file ? [{ key: i.key, file }] : [];
      });
    const keys = new Set(batch.map((b) => b.key));
    setItems((current) =>
      current.map((i) =>
        keys.has(i.key) ? { ...i, status: 'queued', error: undefined, retryable: undefined } : i,
      ),
    );
    await upload(batch);
  }

  async function upload(batch: { key: string; file: File }[]) {
    await uploadPhotos(bookId, batch, (key, patch) =>
      setItems((current) => current.map((i) => (i.key === key ? { ...i, ...patch } : i))),
    );
    // New photos can change days, stops and suggested chapters for the whole book.
    try {
      await organize.mutateAsync();
    } catch {
      await queryClient.invalidateQueries({ queryKey: photosKey(bookId) });
    }
  }

  function onDrop(event: DragEvent) {
    event.preventDefault();
    setDragging(false);
    void start([...event.dataTransfer.files]);
  }

  const done = items.filter((i) => i.status === 'done').length;
  const failed = items.filter((i) => i.status === 'failed').length;
  const retryable = items.filter((i) => i.status === 'failed' && i.retryable).length;

  return (
    <div className="stack" style={{ gap: '0.9rem' }}>
      <div
        className={`dropzone${dragging ? ' dragging' : ''}`}
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
      >
        <p>
          <strong>Drop trip photos here</strong>
          <span className="muted"> or </span>
        </p>
        <button type="button" className="button" onClick={() => input.current?.click()}>
          Choose photos
        </button>
        <p className="hint">JPEG, PNG, WebP or HEIC, up to 10 MB each. Originals work best.</p>
        <input
          ref={input}
          type="file"
          multiple
          accept="image/jpeg,image/png,image/webp,image/heic,image/heif,.heic,.heif"
          hidden
          onChange={(e) => {
            void start([...(e.target.files ?? [])]);
            e.target.value = '';
          }}
        />
      </div>

      {items.length > 0 && (
        <div className="card upload-panel" aria-live="polite">
          <div className="upload-summary">
            <strong>
              {busy ? 'Adding photos…' : `${done} added`}
              {failed > 0 && `, ${failed} failed`}
            </strong>
            {!busy && retryable > 0 && (
              <button type="button" className="button small" onClick={() => void retryFailed()}>
                Retry {retryable === 1 ? 'the failed photo' : `${retryable} failed photos`}
              </button>
            )}
          </div>
          <ul className="upload-list">
            {items.map((item) => (
              <li key={item.key} data-status={item.status}>
                <span className="upload-name">{item.name}</span>
                <span className="upload-status">
                  {LABELS[item.status]}
                  {item.error && <span className="field-error"> · {item.error}</span>}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
