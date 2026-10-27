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

function journal(photos: Photo[], extra: Parameters<typeof mockApi>[0] = {}) {
  const book = { ...JAPAN_BOOK, days: [{ date: '2026-10-10', diary: 'Landed at Haneda.' }] };
  const calls = mockApi({
    'GET /auth/me': { status: 200, body: { user: ASHA } },
    [`GET /books/${BOOK}`]: { status: 200, body: { book } },
    [`GET /books/${BOOK}/photos`]: { status: 200, body: { photos } },
    ...extra,
  });
  renderApp(`/books/${BOOK}/write`);
  return calls;
}

const sent = (calls: ReturnType<typeof mockApi>, method: string, path: string) =>
  calls.filter((c) => c.method === method && c.path === path).map((c) => c.body);

it('shows every day with its diary entry and the captions of its photos', async () => {
  journal([photo('a', { caption: 'Shibuya crossing' }), photo('b', { hidden: true })]);
  expect(await screen.findByRole('heading', { name: 'Write your story' })).toBeTruthy();
  expect(screen.getAllByRole('heading', { level: 2 })).toHaveLength(6);
  expect((screen.getByLabelText('Diary for Day 1 · Sat 10 Oct') as HTMLTextAreaElement).value).toBe(
    'Landed at Haneda.',
  );
  expect((screen.getByLabelText('Caption for a.jpg') as HTMLInputElement).value).toBe(
    'Shibuya crossing',
  );
  expect(screen.queryByLabelText('Caption for b.jpg')).toBeNull();
});

it('saves a diary entry when the field loses focus', async () => {
  const calls = journal([], {
    [`PUT /books/${BOOK}/days/2026-10-12/diary`]: { status: 200, body: { book: JAPAN_BOOK } },
  });
  const field = await screen.findByLabelText('Diary for Day 3 · Mon 12 Oct');
  fireEvent.change(field, { target: { value: 'Fushimi Inari before the crowds.' } });
  fireEvent.blur(field);
  await waitFor(() =>
    expect(sent(calls, 'PUT', `/books/${BOOK}/days/2026-10-12/diary`)).toEqual([
      { diary: 'Fushimi Inari before the crowds.' },
    ]),
  );
  expect(await screen.findByText('Saved')).toBeTruthy();
});

it('saves a caption, and says so when it could not', async () => {
  let fail = true;
  const calls = journal([photo('a')], {
    'PUT /photos/a/caption': () =>
      fail
        ? { status: 500, body: { error: { code: 'INTERNAL', message: 'Something went wrong' } } }
        : { status: 200, body: { photo: photo('a', { caption: 'Golden hour' }) } },
  });
  const field = await screen.findByLabelText('Caption for a.jpg');
  fireEvent.change(field, { target: { value: 'Golden hour' } });
  fireEvent.blur(field);
  expect(await screen.findByText('Not saved.')).toBeTruthy();

  fail = false;
  fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
  expect(await screen.findByText('Saved')).toBeTruthy();
  expect(sent(calls, 'PUT', '/photos/a/caption')).toEqual([
    { caption: 'Golden hour' },
    { caption: 'Golden hour' },
  ]);
});

it('points to the sorting board when photos have no day yet', async () => {
  journal([
    photo('a', { dayDate: null, flags: ['no_time'], localDateTime: null, capturedAt: null }),
  ]);
  expect(await screen.findByText(/1 photo has no day yet/)).toBeTruthy();
  expect(screen.getByRole('link', { name: 'Sort photos' }).getAttribute('href')).toBe(
    `/books/${BOOK}/sort`,
  );
});
