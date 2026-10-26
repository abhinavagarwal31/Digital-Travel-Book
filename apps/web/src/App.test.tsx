import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ASHA, JAPAN_BOOK, mockApi, renderApp, UNAUTHENTICATED } from './test/renderApp.tsx';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function type(label: RegExp | string, value: string) {
  fireEvent.change(screen.getByLabelText(label), { target: { value } });
}

describe('logged out', () => {
  it('shows a visitor the landing page', async () => {
    mockApi({ 'GET /auth/me': UNAUTHENTICATED });
    renderApp('/');
    expect(await screen.findByRole('link', { name: 'Start your first book' })).toBeTruthy();
  });

  it('sends a visitor to the login page from a private page', async () => {
    mockApi({ 'GET /auth/me': UNAUTHENTICATED });
    renderApp('/books/new');
    expect(await screen.findByRole('heading', { name: 'Log in' })).toBeTruthy();
  });

  it('shows the server message for wrong credentials', async () => {
    mockApi({
      'GET /auth/me': UNAUTHENTICATED,
      'POST /auth/login': {
        status: 401,
        body: {
          error: { code: 'INVALID_CREDENTIALS', message: 'Email or password is incorrect' },
        },
      },
    });
    renderApp('/login');
    await screen.findByRole('heading', { name: 'Log in' });
    type('Email', 'asha@example.com');
    type('Password', 'wrong password');
    fireEvent.click(screen.getByRole('button', { name: 'Log in' }));
    expect((await screen.findByRole('alert')).textContent).toBe('Email or password is incorrect');
  });

  it('logs in and lands on the library', async () => {
    const calls = mockApi({
      'GET /auth/me': UNAUTHENTICATED,
      'POST /auth/login': { status: 200, body: { user: ASHA } },
      'GET /books': { status: 200, body: { books: [JAPAN_BOOK] } },
    });
    renderApp('/login');
    await screen.findByRole('heading', { name: 'Log in' });
    type('Email', '  Asha@Example.com ');
    type('Password', 'correct horse battery');
    fireEvent.click(screen.getByRole('button', { name: 'Log in' }));

    expect(await screen.findByRole('heading', { name: 'My travel books' })).toBeTruthy();
    expect(await screen.findByRole('link', { name: 'Whispers of Japan' })).toBeTruthy();
    expect(calls.find((c) => c.path === '/auth/login')?.body).toEqual({
      email: 'asha@example.com',
      password: 'correct horse battery',
    });
  });

  it('catches a short password before sending anything', async () => {
    const calls = mockApi({ 'GET /auth/me': UNAUTHENTICATED });
    renderApp('/register');
    await screen.findByRole('heading', { name: 'Create your account' });
    type('Name', 'Asha');
    type('Email', 'asha@example.com');
    type('Password', 'short');
    fireEvent.click(screen.getByRole('button', { name: 'Create account' }));

    expect(await screen.findByText('Password must be at least 8 characters')).toBeTruthy();
    expect(calls.some((c) => c.method === 'POST')).toBe(false);
  });
});

describe('library', () => {
  it('shows an empty state', async () => {
    mockApi({
      'GET /auth/me': { status: 200, body: { user: ASHA } },
      'GET /books': { status: 200, body: { books: [] } },
    });
    renderApp('/');
    expect(await screen.findByText('No books yet.')).toBeTruthy();
  });

  it('logs out and returns to the login page', async () => {
    const calls = mockApi({
      'GET /auth/me': { status: 200, body: { user: ASHA } },
      'GET /books': { status: 200, body: { books: [] } },
      'POST /auth/logout': { status: 204 },
    });
    renderApp('/');
    fireEvent.click(await screen.findByRole('button', { name: 'Log out' }));
    expect(await screen.findByRole('heading', { name: 'Log in' })).toBeTruthy();
    expect(calls.find((c) => c.path === '/auth/logout')?.body).toEqual({});
  });
});

describe('creating a book', () => {
  function fillTrip(endDate: string) {
    type('Title', 'Whispers of Japan');
    type('Start date', '2026-10-10');
    type('End date', endDate);
    type('Time zone', 'Asia/Tokyo');
    type('Destinations', 'Tokyo, Kyoto , ');
  }

  it('catches an end date before the start date', async () => {
    const calls = mockApi({ 'GET /auth/me': { status: 200, body: { user: ASHA } } });
    renderApp('/books/new');
    await screen.findByRole('heading', { name: 'New travel book' });
    fillTrip('2026-10-01');
    fireEvent.click(screen.getByRole('button', { name: 'Create book' }));

    expect(await screen.findByText('End date must be on or after the start date')).toBeTruthy();
    expect(calls.some((c) => c.method === 'POST')).toBe(false);
  });

  it('clears a field error as soon as the field is edited', async () => {
    mockApi({ 'GET /auth/me': { status: 200, body: { user: ASHA } } });
    renderApp('/books/new');
    await screen.findByRole('heading', { name: 'New travel book' });
    fillTrip('2026-10-15');
    type('Time zone', '+05:30');
    fireEvent.click(screen.getByRole('button', { name: 'Create book' }));
    const error = 'Expected an IANA time zone such as "Asia/Tokyo"';
    expect(await screen.findByText(error)).toBeTruthy();

    type('Time zone', 'Asia/Kolkata');
    expect(screen.queryByText(error)).toBeNull();
  });

  it('creates the book and opens it', async () => {
    const calls = mockApi({
      'GET /auth/me': { status: 200, body: { user: ASHA } },
      'POST /books': { status: 201, body: { book: JAPAN_BOOK } },
      [`GET /books/${JAPAN_BOOK.id}`]: { status: 200, body: { book: JAPAN_BOOK } },
    });
    renderApp('/books/new');
    await screen.findByRole('heading', { name: 'New travel book' });
    fillTrip('2026-10-15');
    fireEvent.click(screen.getByRole('button', { name: 'Create book' }));

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Whispers of Japan' }),
    ).toBeTruthy();
    expect(calls.find((c) => c.method === 'POST')?.body).toEqual({
      title: 'Whispers of Japan',
      startDate: '2026-10-10',
      endDate: '2026-10-15',
      defaultTz: 'Asia/Tokyo',
      destinations: ['Tokyo', 'Kyoto'],
      description: '',
    });
  });
});

describe('a book page', () => {
  it("shows not-found for a missing or someone else's book", async () => {
    mockApi({ 'GET /auth/me': { status: 200, body: { user: ASHA } } });
    renderApp('/books/64b7f0c2a1d3e4f5a6b7ffff');
    expect(await screen.findByRole('heading', { name: 'Page not found' })).toBeTruthy();
  });

  it('edits the trip details', async () => {
    const calls = mockApi({
      'GET /auth/me': { status: 200, body: { user: ASHA } },
      [`GET /books/${JAPAN_BOOK.id}`]: { status: 200, body: { book: JAPAN_BOOK } },
      [`PATCH /books/${JAPAN_BOOK.id}`]: (body) => ({
        status: 200,
        body: { book: { ...JAPAN_BOOK, ...(body as object) } },
      }),
    });
    renderApp(`/books/${JAPAN_BOOK.id}`);
    fireEvent.click(await screen.findByRole('button', { name: 'Edit details' }));
    type('Title', 'Kyoto & beyond');
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));

    expect(await screen.findByRole('heading', { level: 1, name: 'Kyoto & beyond' })).toBeTruthy();
    expect(calls.find((c) => c.method === 'PATCH')?.body).toMatchObject({
      title: 'Kyoto & beyond',
    });
  });

  it('deletes only after confirmation, then returns to the library', async () => {
    const calls = mockApi({
      'GET /auth/me': { status: 200, body: { user: ASHA } },
      [`GET /books/${JAPAN_BOOK.id}`]: { status: 200, body: { book: JAPAN_BOOK } },
      [`DELETE /books/${JAPAN_BOOK.id}`]: { status: 204 },
      'GET /books': { status: 200, body: { books: [] } },
    });
    renderApp(`/books/${JAPAN_BOOK.id}`);
    fireEvent.click(await screen.findByRole('button', { name: 'Delete book…' }));
    expect(calls.some((c) => c.method === 'DELETE')).toBe(false);

    fireEvent.click(screen.getByRole('button', { name: 'Delete book' }));
    expect(await screen.findByText('No books yet.')).toBeTruthy();
    await waitFor(() => expect(calls.some((c) => c.method === 'DELETE')).toBe(true));
  });
});
