import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { ASHA, JAPAN_BOOK, mockApi, renderApp } from '../test/renderApp.tsx';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const BOOK = JAPAN_BOOK.id;

function bookPage(book: object = JAPAN_BOOK) {
  const calls = mockApi({
    'GET /auth/me': { status: 200, body: { user: ASHA } },
    [`GET /books/${BOOK}`]: { status: 200, body: { book } },
    [`GET /books/${BOOK}/photos`]: { status: 200, body: { photos: [] } },
    [`PUT /books/${BOOK}/theme`]: {
      status: 200,
      body: { book: { ...JAPAN_BOOK, theme: { kind: 'preset', id: 'scrapbook', version: 1 } } },
    },
  });
  renderApp(`/books/${BOOK}`);
  return calls;
}

it('offers the three styles with the current one chosen, and saves a new choice', async () => {
  const calls = bookPage();
  const group = await screen.findByRole('group', { name: 'Book style' });
  const radios = within(group).getAllByRole('radio');
  expect(radios.map((r) => (r as HTMLInputElement).value)).toEqual([
    'atlas',
    'editorial',
    'scrapbook',
  ]);
  expect(within(group).getByRole('radio', { name: /Minimal Editorial/ })).toHaveProperty(
    'checked',
    true,
  );

  fireEvent.click(within(group).getByRole('radio', { name: /Scrapbook/ }));
  await waitFor(() =>
    expect(calls.filter((c) => c.method === 'PUT').map((c) => c.body)).toEqual([
      { id: 'scrapbook' },
    ]),
  );
  await waitFor(() =>
    expect(within(group).getByRole('radio', { name: /Scrapbook/ })).toHaveProperty('checked', true),
  );
});

it('tells the owner when their style version is no longer available', async () => {
  bookPage({ ...JAPAN_BOOK, theme: { kind: 'preset', id: 'atlas', version: 9 } });
  expect(
    await screen.findByText(/Illustrated Atlas, version 9\) is no longer available/),
  ).toBeTruthy();
});
