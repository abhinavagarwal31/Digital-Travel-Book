import type { Photo } from '@tb/shared';
import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { ASHA, JAPAN_BOOK, mockApi, renderApp } from '../test/renderApp.tsx';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const BOOK = JAPAN_BOOK.id;

function photo(id: string, changes: Partial<Photo> = {}): Photo {
  return {
    id,
    bookId: BOOK,
    originalFilename: `${id}.jpg`,
    mime: 'image/jpeg',
    bytes: 1,
    status: 'ready',
    failureCode: null,
    capturedAt: '2026-10-11T00:00:00.000Z',
    localDateTime: '2026-10-11T09:00:00',
    timeSource: 'exif_offset',
    gps: null,
    gpsStatus: null,
    dayDate: '2026-10-11',
    assignedBy: 'auto',
    flags: [],
    camera: { make: null, model: null },
    caption: '',
    hidden: false,
    createdAt: '2026-10-20T00:00:00.000Z',
    ...changes,
  };
}

function open(path: string, book: object, photos: Photo[]) {
  const withCover = {
    ...JAPAN_BOOK,
    overrides: { coverPhotoId: 'b', dayLayouts: [], photoOrder: [] },
  };
  const calls = mockApi({
    'GET /auth/me': { status: 200, body: { user: ASHA } },
    [`GET /books/${BOOK}`]: { status: 200, body: { book } },
    [`GET /books/${BOOK}/photos`]: { status: 200, body: { photos } },
    [`PUT /books/${BOOK}/cover`]: { status: 200, body: { book: withCover } },
    [`PUT /books/${BOOK}/day-layouts/2026-10-11`]: { status: 200, body: { book: JAPAN_BOOK } },
  });
  renderApp(path);
  return calls;
}

const sent = (calls: ReturnType<typeof mockApi>, path: string) =>
  calls.filter((c) => c.method === 'PUT' && c.path === path).map((c) => c.body);

it('makes a photo the cover from the book page, and only photos that are in the book', async () => {
  const calls = open(`/books/${BOOK}`, JAPAN_BOOK, [
    photo('a'),
    photo('b'),
    photo('hidden', { hidden: true }),
    photo('unsorted', { dayDate: null }),
  ]);
  fireEvent.click(await screen.findByRole('button', { name: 'Use b.jpg as the cover' }));
  await waitFor(() => expect(sent(calls, `/books/${BOOK}/cover`)).toEqual([{ photoId: 'b' }]));
  await waitFor(() =>
    expect(
      screen.getByRole('button', { name: 'Use b.jpg as the cover' }).getAttribute('aria-pressed'),
    ).toBe('true'),
  );
  expect(screen.queryByRole('button', { name: /Use hidden\.jpg/ })).toBeNull();
  expect(screen.queryByRole('button', { name: /Use unsorted\.jpg/ })).toBeNull();

  // Pressing it again goes back to the plain cover.
  fireEvent.click(screen.getByRole('button', { name: 'Use b.jpg as the cover' }));
  await waitFor(() =>
    expect(sent(calls, `/books/${BOOK}/cover`).at(-1)).toEqual({ photoId: null }),
  );
});

it("offers only the theme's layouts for a day, with the style's own as the default", async () => {
  // Editorial: one, two or three a page, three by default.
  const calls = open(`/books/${BOOK}/write`, JAPAN_BOOK, [photo('a'), photo('b')]);
  const select = await screen.findByRole('combobox', {
    name: 'Photo layout for Day 2 · Sun 11 Oct',
  });
  expect([...(select as HTMLSelectElement).options].map((o) => o.textContent)).toEqual([
    'Three photos a page (style default)',
    'One photo a page',
    'Two photos a page',
  ]);
  fireEvent.change(select, { target: { value: 'hero-1' } });
  await waitFor(() =>
    expect(sent(calls, `/books/${BOOK}/day-layouts/2026-10-11`)).toEqual([{ layout: 'hero-1' }]),
  );
});

it('shows a saved layout the theme no longer offers as the default', async () => {
  const book = {
    ...JAPAN_BOOK,
    overrides: {
      coverPhotoId: null,
      dayLayouts: [{ date: '2026-10-11', layout: 'grid-4' }],
      photoOrder: [],
    },
  };
  open(`/books/${BOOK}/write`, book, [photo('a'), photo('b')]);
  const select = (await screen.findByRole('combobox', {
    name: /Photo layout for Day 2/,
  })) as HTMLSelectElement;
  expect(select.value).toBe('');
});

it('prints the chosen photo on the cover of the book', async () => {
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: query.includes('min-width'),
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
  }));
  const book = { ...JAPAN_BOOK, overrides: { coverPhotoId: 'b', dayLayouts: [], photoOrder: [] } };
  open(`/books/${BOOK}/read`, book, [photo('a'), photo('b')]);
  await screen.findByRole('heading', { name: JAPAN_BOOK.title, level: 1 });
  const cover = document.querySelector('.cover-page.with-photo .cover-photo');
  expect(cover?.getAttribute('src')).toContain('/photos/b/image/page');
});
