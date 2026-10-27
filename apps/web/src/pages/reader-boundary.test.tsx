import type { BookPage } from '@tb/shared';
import { cleanup, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { ASHA, JAPAN_BOOK, mockApi, renderApp } from '../test/renderApp.tsx';

// A page renderer with one broken kind of page.
vi.mock('../components/reader/PageView.tsx', () => ({
  PageView: ({ page }: { page: BookPage }) => {
    if (page.kind === 'endpaper') throw new Error('broken page');
    return <div className="page">page: {page.kind}</div>;
  },
}));

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

it('one page that fails to draw leaves the rest of the book readable', async () => {
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: query.includes('min-width'),
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
  }));
  mockApi({
    'GET /auth/me': { status: 200, body: { user: ASHA } },
    [`GET /books/${JAPAN_BOOK.id}`]: { status: 200, body: { book: JAPAN_BOOK } },
    [`GET /books/${JAPAN_BOOK.id}/photos`]: { status: 200, body: { photos: [] } },
  });
  renderApp(`/books/${JAPAN_BOOK.id}/read`);

  expect(await screen.findByText('page: cover')).toBeTruthy();
  expect(screen.getByText('page: title')).toBeTruthy();
  expect(screen.getByText('This page could not be shown.')).toBeTruthy();
  // With no photos or diary, the reader says how to fill the book.
  expect(screen.getByText(/This book has no pages of its own yet/)).toBeTruthy();
});
