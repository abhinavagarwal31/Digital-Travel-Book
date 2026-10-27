import type { Photo } from '@tb/shared';
import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
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

describe('chapters', () => {
  const CHAPTERED = {
    ...JAPAN_BOOK,
    chapters: [
      {
        id: 'c-2026-10-10',
        title: 'Chapter 1 · 10 – 12 Oct',
        dayDates: ['2026-10-10', '2026-10-11', '2026-10-12'],
      },
      { id: 'kyoto', title: 'Kyoto', dayDates: ['2026-10-13', '2026-10-14', '2026-10-15'] },
    ],
  };

  function chaptered() {
    const calls = mockApi({
      'GET /auth/me': { status: 200, body: { user: ASHA } },
      [`GET /books/${BOOK}`]: { status: 200, body: { book: CHAPTERED } },
      [`GET /books/${BOOK}/photos`]: { status: 200, body: { photos: [] } },
      [`PUT /books/${BOOK}/chapters`]: { status: 200, body: { book: CHAPTERED, summary: {} } },
    });
    renderApp(`/books/${BOOK}/write`);
    return calls;
  }
  const saved = (calls: ReturnType<typeof mockApi>) =>
    sent(calls, 'PUT', `/books/${BOOK}/chapters`).map(
      (b) => (b as { chapters: { title: string; dayDates: string[] }[] }).chapters,
    );

  it('names a chapter, and an emptied name goes back to the automatic one', async () => {
    const calls = chaptered();
    const title = (await screen.findByLabelText('Title of chapter 1')) as HTMLInputElement;
    // The app's own title shows as a hint, not as text to delete.
    expect(title.value).toBe('');
    expect((screen.getByLabelText('Title of chapter 2') as HTMLInputElement).value).toBe('Kyoto');

    fireEvent.change(title, { target: { value: 'Tokyo' } });
    fireEvent.blur(title);
    await waitFor(() => expect(saved(calls).at(-1)?.[0]?.title).toBe('Tokyo'));

    fireEvent.change(title, { target: { value: '  ' } });
    fireEvent.blur(title);
    await waitFor(() => expect(saved(calls).at(-1)?.[0]?.title).toBe('Chapter 1 · 10 – 12 Oct'));
  });

  it('renaming two chapters quickly keeps both names', async () => {
    // Like the server: answer each save with the chapters it was sent.
    const calls = mockApi({
      'GET /auth/me': { status: 200, body: { user: ASHA } },
      [`GET /books/${BOOK}`]: { status: 200, body: { book: CHAPTERED } },
      [`GET /books/${BOOK}/photos`]: { status: 200, body: { photos: [] } },
      [`PUT /books/${BOOK}/chapters`]: (body) => ({
        status: 200,
        body: { book: { ...CHAPTERED, ...(body as object) }, summary: {} },
      }),
    });
    renderApp(`/books/${BOOK}/write`);
    const first = await screen.findByLabelText('Title of chapter 1');
    const second = screen.getByLabelText('Title of chapter 2');
    fireEvent.change(first, { target: { value: 'Tokyo' } });
    fireEvent.blur(first);
    fireEvent.change(second, { target: { value: 'Kansai' } });
    fireEvent.blur(second);

    await waitFor(() =>
      expect(
        saved(calls)
          .at(-1)
          ?.map((c) => c.title),
      ).toEqual(['Tokyo', 'Kansai']),
    );
  });

  it('starts a new chapter at a day, and joins one onto the chapter before', async () => {
    const calls = chaptered();
    const splits = await screen.findAllByRole('button', { name: /Start a new chapter here/ });
    // Every day but the first of each chapter can start one.
    expect(splits).toHaveLength(4);
    fireEvent.click(splits[0] as HTMLElement);
    await waitFor(() =>
      expect(
        saved(calls)
          .at(-1)
          ?.map((c) => c.dayDates),
      ).toEqual([
        ['2026-10-10'],
        ['2026-10-11', '2026-10-12'],
        ['2026-10-13', '2026-10-14', '2026-10-15'],
      ]),
    );

    fireEvent.click(await screen.findByRole('button', { name: 'Join with the chapter before' }));
    await waitFor(() => expect(saved(calls).at(-1)).toHaveLength(1));
    expect(saved(calls).at(-1)?.[0]?.title).toBe('Chapter 1 · 10 – 15 Oct');
  });
});

it("reorders a day's photos, the first opening the day in the book", async () => {
  const calls = journal(
    [
      photo('a', { localDateTime: '2026-10-11T08:00:00' }),
      photo('b', { localDateTime: '2026-10-11T09:00:00' }),
      photo('c', { localDateTime: '2026-10-11T10:00:00' }),
    ],
    {
      [`PUT /books/${BOOK}/days/2026-10-11/photo-order`]: {
        status: 200,
        body: { book: JAPAN_BOOK },
      },
    },
  );
  expect(
    (await screen.findByRole('button', { name: 'Move a.jpg earlier' })).hasAttribute('disabled'),
  ).toBe(true);
  expect(screen.getByRole('button', { name: 'Move c.jpg later' }).hasAttribute('disabled')).toBe(
    true,
  );
  fireEvent.click(screen.getByRole('button', { name: 'Move c.jpg earlier' }));
  await waitFor(() =>
    expect(sent(calls, 'PUT', `/books/${BOOK}/days/2026-10-11/photo-order`)).toEqual([
      { photoIds: ['a', 'c', 'b'] },
    ]),
  );
  expect(screen.getByText('Opens the day')).toBeTruthy();
});
