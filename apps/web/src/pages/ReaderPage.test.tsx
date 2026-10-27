import type { Photo } from '@tb/shared';
import { cleanup, fireEvent, screen, within } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { ASHA, JAPAN_BOOK, mockApi, renderApp } from '../test/renderApp.tsx';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const BOOK = {
  ...JAPAN_BOOK,
  chapters: [
    { id: 'tokyo', title: 'Neon nights', dayDates: ['2026-10-10'] },
    { id: 'kyoto', title: 'Chapter 2 · 11 Oct', dayDates: ['2026-10-11'] },
  ],
};

function photo(id: string, day: string, time: string, lat: number, lng: number): Photo {
  return {
    id,
    bookId: BOOK.id,
    originalFilename: `${id}.jpg`,
    mime: 'image/jpeg',
    bytes: 1,
    status: 'ready',
    failureCode: null,
    capturedAt: `${day}T${time}:00.000Z`,
    localDateTime: `${day}T${time}:00`,
    timeSource: 'exif_offset',
    gps: { lat, lng },
    gpsStatus: 'exif',
    dayDate: day,
    assignedBy: 'auto',
    flags: [],
    camera: { make: null, model: null },
    caption: '',
    hidden: false,
    createdAt: '2026-10-20T00:00:00.000Z',
  };
}

// jsdom has no media queries: read as on a wide screen, two pages at a time,
// with no preference for reduced motion.
function wideScreen() {
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: query.includes('min-width'),
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
  }));
}

it('opens each chapter with its map, after a map of the whole trip', async () => {
  mockApi({
    'GET /auth/me': { status: 200, body: { user: ASHA } },
    [`GET /books/${BOOK.id}`]: { status: 200, body: { book: BOOK } },
    [`GET /books/${BOOK.id}/photos`]: {
      status: 200,
      body: {
        photos: [
          photo('a', '2026-10-10', '09:00', 35.68, 139.76),
          photo('b', '2026-10-10', '15:00', 35.71, 139.8),
          photo('c', '2026-10-11', '10:00', 35.01, 135.77),
        ],
      },
    },
  });
  wideScreen();
  renderApp(`/books/${BOOK.id}/read`);

  const toc = await screen.findByRole('combobox', { name: 'Go to' });
  const labels = within(toc)
    .getAllByRole('option')
    .map((o) => o.textContent?.trim());
  expect(labels).toEqual([
    'Cover',
    'Title page',
    'Map of the trip',
    '1. Neon nights',
    'Day 1 · Sat 10 Oct',
    'Chapter 2 · 11 Oct',
    'Day 2 · Sun 11 Oct',
    'The end',
  ]);

  const option = (label: string) =>
    within(toc)
      .getAllByRole('option')
      .find((o) => o.textContent?.trim() === label) as HTMLOptionElement;

  fireEvent.change(toc, { target: { value: option('Map of the trip').value } });
  const trip = await screen.findByRole('img', { name: /^Map of the trip: 2 chapters/ });
  expect(trip.querySelectorAll('.route-pin')).toHaveLength(2);
  expect(screen.getByText('Chapters, in reading order')).toBeTruthy();

  fireEvent.change(toc, { target: { value: option('1. Neon nights').value } });
  const tokyo = await screen.findByRole('img', {
    name: 'Map of 2 places photographed in this chapter, in order',
  });
  expect(tokyo.querySelectorAll('.route-line')).toHaveLength(1);
  // The editorial theme's tiles, with their credit on the page.
  expect(tokyo.querySelector('image')?.getAttribute('href')).toContain('/alidade_smooth/');
  expect(screen.getAllByText(/© Stadia Maps/).length).toBeGreaterThan(0);
  expect(screen.getByRole('heading', { name: 'Neon nights' })).toBeTruthy();
});
