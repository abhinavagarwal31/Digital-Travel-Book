import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { ASHA, JAPAN_BOOK, mockApi, renderApp } from '../test/renderApp.tsx';
import { ErrorBoundary } from './ErrorBoundary.tsx';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

let explode = true;
function Fragile() {
  if (explode) throw new Error('boom');
  return <p>Drawn</p>;
}

it('contains a rendering error and can try again', () => {
  vi.spyOn(console, 'error').mockImplementation(() => {});
  explode = true;
  render(
    <>
      <ErrorBoundary
        fallback={(retry) => (
          <button type="button" onClick={retry}>
            Try that again
          </button>
        )}
      >
        <Fragile />
      </ErrorBoundary>
      <p>Untouched</p>
    </>,
  );
  expect(screen.getByText('Untouched')).toBeTruthy();
  explode = false;
  fireEvent.click(screen.getByRole('button', { name: 'Try that again' }));
  expect(screen.getByText('Drawn')).toBeTruthy();
});

it('offers to try a failed load again, and recovers without a reload', async () => {
  let fail = true;
  mockApi({
    'GET /auth/me': { status: 200, body: { user: ASHA } },
    'GET /books': () =>
      fail
        ? { status: 500, body: { error: { code: 'INTERNAL', message: 'Something went wrong' } } }
        : { status: 200, body: { books: [JAPAN_BOOK] } },
  });
  renderApp('/');
  // A 5xx is retried twice by the query client first; this one keeps failing.
  const retry = await screen.findByRole('button', { name: 'Try again' }, { timeout: 8000 });
  expect(screen.getByText(/Could not load your books/)).toBeTruthy();
  fail = false;
  fireEvent.click(retry);
  expect(await screen.findByRole('link', { name: 'Whispers of Japan' })).toBeTruthy();
}, 15_000);

it('the sorting board says what to do before there are any photos', async () => {
  mockApi({
    'GET /auth/me': { status: 200, body: { user: ASHA } },
    [`GET /books/${JAPAN_BOOK.id}`]: { status: 200, body: { book: JAPAN_BOOK } },
    [`GET /books/${JAPAN_BOOK.id}/photos`]: { status: 200, body: { photos: [] } },
  });
  renderApp(`/books/${JAPAN_BOOK.id}/sort`);
  expect(await screen.findByRole('heading', { name: 'Nothing to sort yet' })).toBeTruthy();
  expect(screen.getByRole('link', { name: 'Add photos' }).getAttribute('href')).toBe(
    `/books/${JAPAN_BOOK.id}`,
  );
});
