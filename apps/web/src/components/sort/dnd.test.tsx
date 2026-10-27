import type { Photo } from '@tb/shared';
import { act, cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ASHA, JAPAN_BOOK, mockApi, renderApp } from '../../test/renderApp.tsx';
import { draggedPhotos, nextZone, photosToMove } from './dnd.tsx';

const p = (id: string, dayDate: string | null = null) => ({ id, dayDate }) as Photo;

describe('drop rules', () => {
  const zones = [
    { id: 'day:2026-10-11', order: 2 },
    { id: 'tray', order: 0 },
    { id: 'day:2026-10-10', order: 1 },
  ];

  it('walks the zones in order with the arrow keys, stopping at the ends', () => {
    expect(nextZone(zones, null, true)).toBe('tray');
    expect(nextZone(zones, 'tray', true)).toBe('day:2026-10-10');
    expect(nextZone(zones, 'day:2026-10-10', true)).toBe('day:2026-10-11');
    expect(nextZone(zones, 'day:2026-10-11', true)).toBe('day:2026-10-11');
    expect(nextZone(zones, 'day:2026-10-10', false)).toBe('tray');
    expect(nextZone(zones, 'tray', false)).toBe('tray');
    expect(nextZone([], null, true)).toBeNull();
  });

  it('drags the whole selection only when the dragged photo is part of it', () => {
    const selection = [p('a'), p('b')];
    expect(draggedPhotos(p('a'), selection)).toBe(selection);
    expect(draggedPhotos(p('c'), selection).map((x) => x.id)).toEqual(['c']);
  });

  it('moves only the photos that are not already where they are dropped', () => {
    const photos = [p('a', '2026-10-10'), p('b', null), p('c', '2026-10-11')];
    expect(photosToMove(photos, '2026-10-10').map((x) => x.id)).toEqual(['b', 'c']);
    expect(photosToMove(photos, null).map((x) => x.id)).toEqual(['a', 'c']);
  });
});

describe('moving a photo by keyboard', () => {
  const BOOK = JAPAN_BOOK.id;
  const photo = {
    id: 'a',
    bookId: BOOK,
    originalFilename: 'a.jpg',
    mime: 'image/jpeg',
    bytes: 1,
    status: 'ready',
    failureCode: null,
    capturedAt: null,
    localDateTime: null,
    timeSource: null,
    gps: null,
    gpsStatus: null,
    dayDate: null,
    assignedBy: 'auto',
    flags: ['no_time'],
    camera: { make: null, model: null },
    caption: '',
    hidden: false,
    width: null,
    height: null,
    createdAt: '2026-10-20T00:00:00.000Z',
  };

  // jsdom has no layout: give every element its own 150px-tall row so drop
  // zones never overlap and collision detection behaves as on screen.
  beforeEach(() => {
    const rows = new WeakMap<Element, number>();
    let next = 0;
    vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (
      this: Element,
    ) {
      if (!rows.has(this)) rows.set(this, next++);
      const top = (rows.get(this) as number) * 200;
      return DOMRect.fromRect({ x: 0, y: top, width: 300, height: 150 });
    });
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('picks up with Enter, walks days with the arrows and drops with Enter', async () => {
    const calls = mockApi({
      'GET /auth/me': { status: 200, body: { user: ASHA } },
      [`GET /books/${BOOK}`]: { status: 200, body: { book: JAPAN_BOOK } },
      [`GET /books/${BOOK}/photos`]: { status: 200, body: { photos: [photo] } },
      [`PUT /books/${BOOK}/photos/day`]: { status: 200, body: { book: JAPAN_BOOK, summary: {} } },
    });
    renderApp(`/books/${BOOK}/sort`);
    const chip = await screen.findByRole('button', { name: /^a\.jpg/ });

    chip.focus();
    fireEvent.keyDown(chip, { code: 'Enter', key: 'Enter' });
    expect(await screen.findByText(/Picked up 1 photo/)).toBeTruthy();
    // The sensor starts listening on the next tick.
    await act(() => new Promise((r) => setTimeout(r, 0)));

    fireEvent.keyDown(document, { code: 'ArrowDown', key: 'ArrowDown' });
    expect(await screen.findByText('Over To sort (no day).')).toBeTruthy();
    fireEvent.keyDown(document, { code: 'ArrowDown', key: 'ArrowDown' });
    fireEvent.keyDown(document, { code: 'ArrowDown', key: 'ArrowDown' });
    expect(await screen.findByText('Over Day 2 · Sun 11 Oct.')).toBeTruthy();
    fireEvent.keyDown(document, { code: 'Enter', key: 'Enter' });

    await waitFor(() =>
      expect(calls.filter((c) => c.method === 'PUT').map((c) => c.body)).toEqual([
        { photoIds: ['a'], dayDate: '2026-10-11' },
      ]),
    );
    expect(await screen.findByText('Moved 1 photo to Day 2 · Sun 11 Oct')).toBeTruthy();
  });

  it('cancels with Escape and changes nothing', async () => {
    const calls = mockApi({
      'GET /auth/me': { status: 200, body: { user: ASHA } },
      [`GET /books/${BOOK}`]: { status: 200, body: { book: JAPAN_BOOK } },
      [`GET /books/${BOOK}/photos`]: { status: 200, body: { photos: [photo] } },
    });
    renderApp(`/books/${BOOK}/sort`);
    const chip = await screen.findByRole('button', { name: /^a\.jpg/ });

    fireEvent.keyDown(chip, { code: 'Enter', key: 'Enter' });
    await screen.findByText(/Picked up 1 photo/);
    await act(() => new Promise((r) => setTimeout(r, 0)));
    fireEvent.keyDown(document, { code: 'ArrowDown', key: 'ArrowDown' });
    fireEvent.keyDown(document, { code: 'ArrowDown', key: 'ArrowDown' });
    fireEvent.keyDown(document, { code: 'Escape', key: 'Escape' });

    expect(await screen.findByText('Cancelled. Nothing moved.')).toBeTruthy();
    expect(calls.some((c) => c.method !== 'GET')).toBe(false);
  });
});
