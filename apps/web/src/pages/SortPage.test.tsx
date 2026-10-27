import type { Photo } from '@tb/shared';
import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ASHA, JAPAN_BOOK, mockApi, renderApp } from '../test/renderApp.tsx';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const BOOK = JAPAN_BOOK.id;
const SORTED = { status: 200, body: { book: JAPAN_BOOK, summary: {} } };

function photo(id: string, changes: Partial<Photo> = {}): Photo {
  return {
    id,
    bookId: BOOK,
    originalFilename: `${id}.jpg`,
    mime: 'image/jpeg',
    bytes: 1000,
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

const UNDATED: Partial<Photo> = {
  capturedAt: null,
  localDateTime: null,
  dayDate: null,
  flags: ['no_time'],
};

function board(photos: Photo[], extra: Parameters<typeof mockApi>[0] = {}) {
  const calls = mockApi({
    'GET /auth/me': { status: 200, body: { user: ASHA } },
    [`GET /books/${BOOK}`]: { status: 200, body: { book: JAPAN_BOOK } },
    [`GET /books/${BOOK}/photos`]: { status: 200, body: { photos } },
    ...extra,
  });
  renderApp(`/books/${BOOK}/sort`);
  return calls;
}

const sent = (calls: ReturnType<typeof mockApi>, method: string, path: string) =>
  calls.filter((c) => c.method === method && c.path === path).map((c) => c.body);

describe('the sorting tray', () => {
  it('says why each photo needs sorting', async () => {
    board([
      photo('a', UNDATED),
      photo('b', { ...UNDATED, flags: ['outside_trip'], localDateTime: '2025-01-01T10:00:00' }),
      photo('c', { dayDate: null, assignedBy: 'user' }),
      photo('d', { ...UNDATED, gps: { lat: 35, lng: 139 }, gpsStatus: 'exif' }),
      photo('e'),
    ]);
    const tray = await screen.findByRole('complementary');
    expect(within(tray).getByRole('button', { name: /^a\.jpg, No date$/ })).toBeTruthy();
    expect(
      within(tray).getByRole('button', { name: /^b\.jpg.*Date outside the trip$/ }),
    ).toBeTruthy();
    expect(
      within(tray).getByRole('button', { name: /^c\.jpg.*You took it out of a day$/ }),
    ).toBeTruthy();
    expect(
      within(tray).getByRole('button', { name: /^d\.jpg, No date \(has location\)$/ }),
    ).toBeTruthy();
    expect(within(tray).queryByRole('button', { name: /^e\.jpg/ })).toBeNull();
    expect(screen.getByText(/4 to sort/)).toBeTruthy();
  });

  it('asks about a suspicious location and confirms it', async () => {
    const calls = board(
      [photo('a', { gps: { lat: 0, lng: 0 }, gpsStatus: 'exif', flags: ['gps_outlier'] })],
      {
        'PUT /photos/a/location': SORTED,
      },
    );
    fireEvent.click(await screen.findByRole('button', { name: 'Location is right' }));
    await waitFor(() =>
      expect(sent(calls, 'PUT', '/photos/a/location')).toEqual([{ action: 'confirm' }]),
    );
  });
});

describe('moving photos, click first', () => {
  it('moves the selected photos to the day chosen', async () => {
    const calls = board([photo('a', UNDATED), photo('b', UNDATED)], {
      [`PUT /books/${BOOK}/photos/day`]: SORTED,
    });
    fireEvent.click(await screen.findByRole('button', { name: /^a\.jpg/ }));
    fireEvent.click(screen.getByRole('button', { name: /^b\.jpg/ }));
    expect(screen.getByText('2 selected')).toBeTruthy();

    fireEvent.click(
      screen.getByRole('button', { name: 'Move selected photos to Day 2 · Sun 11 Oct' }),
    );
    await waitFor(() =>
      expect(sent(calls, 'PUT', `/books/${BOOK}/photos/day`)).toEqual([
        { photoIds: ['a', 'b'], dayDate: '2026-10-11' },
      ]),
    );
    expect(await screen.findByText('Moved 2 photos to Day 2 · Sun 11 Oct')).toBeTruthy();
  });

  it('selects a range with shift-click', async () => {
    board([photo('a', UNDATED), photo('b', UNDATED), photo('c', UNDATED)]);
    fireEvent.click(await screen.findByRole('button', { name: /^a\.jpg/ }));
    fireEvent.click(screen.getByRole('button', { name: /^c\.jpg/ }), { shiftKey: true });
    expect(screen.getByRole('button', { name: /^b\.jpg/ }).getAttribute('aria-pressed')).toBe(
      'true',
    );
    expect(screen.getByText('3 selected')).toBeTruthy();
  });

  it('undoes a move with the state it left behind, so a newer change is never overwritten', async () => {
    const calls = board(
      [photo('a', UNDATED), photo('b', { dayDate: '2026-10-12', assignedBy: 'user' })],
      {
        [`PUT /books/${BOOK}/photos/day`]: SORTED,
        [`POST /books/${BOOK}/photos/day-reset`]: SORTED,
      },
    );
    fireEvent.click(await screen.findByRole('button', { name: /^a\.jpg/ }));
    fireEvent.click(screen.getByRole('button', { name: /^b\.jpg/ }));
    fireEvent.click(
      screen.getByRole('button', { name: 'Move selected photos to Day 1 · Sat 10 Oct' }),
    );
    fireEvent.click(await screen.findByRole('button', { name: 'Undo' }));

    const after = { dayDate: '2026-10-10', assignedBy: 'user' };
    await waitFor(() =>
      expect(sent(calls, 'POST', `/books/${BOOK}/photos/day-reset`)).toEqual([
        { photoIds: ['a'], expect: { a: after } },
      ]),
    );
    await waitFor(() =>
      expect(sent(calls, 'PUT', `/books/${BOOK}/photos/day`).at(-1)).toEqual({
        photoIds: ['b'],
        dayDate: '2026-10-12',
        expect: { b: after },
      }),
    );
  });

  it('explains a refused undo instead of forcing it', async () => {
    board([photo('a', UNDATED)], {
      [`PUT /books/${BOOK}/photos/day`]: SORTED,
      [`POST /books/${BOOK}/photos/day-reset`]: {
        status: 409,
        body: {
          error: { code: 'CONFLICT', message: 'These photos changed since you last saw them' },
        },
      },
    });
    fireEvent.click(await screen.findByRole('button', { name: /^a\.jpg/ }));
    fireEvent.click(
      screen.getByRole('button', { name: 'Move selected photos to Day 1 · Sat 10 Oct' }),
    );
    fireEvent.click(await screen.findByRole('button', { name: 'Undo' }));
    expect(await screen.findByText(/Could not undo: those photos were changed since/)).toBeTruthy();
  });

  it('leaves photos out of the book and brings them back', async () => {
    const calls = board([photo('a', UNDATED), photo('b', { hidden: true })], {
      [`PUT /books/${BOOK}/photos/visibility`]: SORTED,
    });
    fireEvent.click(await screen.findByRole('button', { name: /^a\.jpg/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Exclude' }));
    await waitFor(() =>
      expect(sent(calls, 'PUT', `/books/${BOOK}/photos/visibility`)).toEqual([
        { photoIds: ['a'], hidden: true },
      ]),
    );

    fireEvent.click(screen.getByRole('button', { name: 'Include again' }));
    await waitFor(() =>
      expect(sent(calls, 'PUT', `/books/${BOOK}/photos/visibility`).at(-1)).toEqual({
        photoIds: ['b'],
        hidden: false,
      }),
    );
  });
});

describe('progress', () => {
  it('celebrates when nothing is left to decide', async () => {
    board([photo('a'), photo('b', { dayDate: '2026-10-12' }), photo('c', { hidden: true })]);
    expect(await screen.findByRole('heading', { name: 'Everything is sorted' })).toBeTruthy();
    expect(screen.getByText(/of 2 photos in the book/)).toBeTruthy();
    expect(screen.getByText('Nothing left to sort.')).toBeTruthy();
  });

  it('groups a day into the stops it was taken at', async () => {
    const at = (h: string, lat: number) => ({
      capturedAt: `2026-10-11T${h}:00:00.000Z`,
      localDateTime: `2026-10-11T${h}:00:00`,
      gps: { lat, lng: 139.7 },
      gpsStatus: 'exif' as const,
    });
    board([photo('a', at('09', 35.68)), photo('b', at('10', 35.6801)), photo('c', at('15', 35.0))]);
    await screen.findByText('09:00 – 10:00');
    const labels = [...document.querySelectorAll('.sort-stop-label')].map((l) => l.textContent);
    expect(labels).toEqual(['09:00 – 10:00', '']);
  });
});

it('the book page links to the board with the number of photos waiting', async () => {
  mockApi({
    'GET /auth/me': { status: 200, body: { user: ASHA } },
    [`GET /books/${BOOK}`]: { status: 200, body: { book: JAPAN_BOOK } },
    [`GET /books/${BOOK}/photos`]: {
      status: 200,
      body: { photos: [photo('a', UNDATED), photo('b', UNDATED), photo('c')] },
    },
  });
  renderApp(`/books/${BOOK}`);
  const link = await screen.findByRole('link', { name: /Sort photos/ });
  expect(link.getAttribute('href')).toBe(`/books/${BOOK}/sort`);
  expect(link.textContent).toContain('2');
});
