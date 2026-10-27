import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { ASHA, JAPAN_BOOK, mockApi, renderApp } from '../test/renderApp.tsx';
import type { UploadItem } from '../lib/upload.ts';

type Report = (key: string, patch: Partial<UploadItem>) => void;
const attempts: string[][] = [];

// The network side is tested in lib/upload.test.ts; here only what the panel does with it.
vi.mock('../lib/upload.ts', async (original) => ({
  ...(await original<typeof import('../lib/upload.ts')>()),
  uploadPhotos: vi.fn(
    async (_book: string, items: { key: string; file: File }[], report: Report) => {
      attempts.push(items.map((i) => i.file.name));
      for (const { key, file } of items) {
        if (file.name === 'notes.txt') {
          report(key, { status: 'failed', error: 'Not a supported photo', retryable: false });
        } else if (attempts.length === 1) {
          report(key, {
            status: 'failed',
            error: 'Photo storage is not answering',
            retryable: true,
          });
        } else {
          report(key, { status: 'done' });
        }
      }
    },
  ),
}));

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

it('retries only the uploads worth retrying, with the same files', async () => {
  const BOOK = JAPAN_BOOK.id;
  mockApi({
    'GET /auth/me': { status: 200, body: { user: ASHA } },
    [`GET /books/${BOOK}`]: { status: 200, body: { book: JAPAN_BOOK } },
    [`GET /books/${BOOK}/photos`]: { status: 200, body: { photos: [] } },
    [`POST /books/${BOOK}/organize`]: { status: 200, body: { book: JAPAN_BOOK, summary: {} } },
  });
  renderApp(`/books/${BOOK}`);
  await screen.findByRole('button', { name: 'Choose photos' });

  const input = document.querySelector('input[type=file]') as HTMLInputElement;
  const files = ['a.jpg', 'b.jpg', 'notes.txt'].map((n) => new File(['x'], n));
  fireEvent.change(input, { target: { files } });

  const retry = await screen.findByRole('button', { name: 'Retry 2 failed photos' });
  expect(screen.getByText('0 added, 3 failed')).toBeTruthy();
  fireEvent.click(retry);

  await waitFor(() => expect(screen.getByText('2 added, 1 failed')).toBeTruthy());
  expect(attempts).toEqual([
    ['a.jpg', 'b.jpg', 'notes.txt'],
    ['a.jpg', 'b.jpg'],
  ]);
  expect(screen.queryByRole('button', { name: /Retry/ })).toBeNull();
});
