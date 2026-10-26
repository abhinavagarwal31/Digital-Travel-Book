import { useQueryClient } from '@tanstack/react-query';
import { useRef, useState, type DragEvent } from 'react';
import { photosKey } from '../lib/photos.ts';
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
  const input = useRef<HTMLInputElement>(null);
  const [items, setItems] = useState<UploadItem[]>([]);
  const [dragging, setDragging] = useState(false);
  const busy = items.some((i) => !['done', 'duplicate', 'failed'].includes(i.status));

  async function start(files: File[]) {
    if (files.length === 0) return;
    const batch = files.map((file) => ({ key: String(nextKey++), file }));
    setItems((current) => [
      ...current.filter((i) => !['done', 'duplicate'].includes(i.status)),
      ...batch.map(({ key, file }) => ({ key, name: file.name, status: 'queued' as const })),
    ]);
    await uploadPhotos(bookId, batch, (key, patch) =>
      setItems((current) => current.map((i) => (i.key === key ? { ...i, ...patch } : i))),
    );
    await queryClient.invalidateQueries({ queryKey: photosKey(bookId) });
  }

  function onDrop(event: DragEvent) {
    event.preventDefault();
    setDragging(false);
    void start([...event.dataTransfer.files]);
  }

  const done = items.filter((i) => i.status === 'done').length;
  const failed = items.filter((i) => i.status === 'failed').length;

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
          <p>
            <strong>
              {busy ? 'Adding photos…' : `${done} added`}
              {failed > 0 && `, ${failed} failed`}
            </strong>
          </p>
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
