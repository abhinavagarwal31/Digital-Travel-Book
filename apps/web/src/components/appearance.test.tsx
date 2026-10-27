import { cleanup, fireEvent, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { ASHA, mockApi, renderApp } from '../test/renderApp.tsx';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  localStorage.clear();
  delete document.documentElement.dataset.theme;
});

it('switches between light and dark from the header, and remembers it', async () => {
  mockApi({
    'GET /auth/me': { status: 200, body: { user: ASHA } },
    'GET /books': { status: 200, body: { books: [] } },
  });
  document.documentElement.dataset.theme = 'light';
  renderApp('/');
  fireEvent.click(await screen.findByRole('button', { name: 'Switch to dark mode' }));
  expect(document.documentElement.dataset.theme).toBe('dark');
  expect(localStorage.getItem('tb-appearance')).toBe('dark');
  fireEvent.click(screen.getByRole('button', { name: 'Switch to light mode' }));
  expect(document.documentElement.dataset.theme).toBe('light');
  expect(localStorage.getItem('tb-appearance')).toBe('light');
});

it('offers following the device on the account page, which forgets the choice', async () => {
  localStorage.setItem('tb-appearance', 'dark');
  mockApi({
    'GET /auth/me': { status: 200, body: { user: ASHA } },
    'GET /account': {
      status: 200,
      body: {
        account: {
          user: ASHA,
          plan: 'free',
          photoLimit: 200,
          usage: { books: 0, photos: 0, fullestBook: null },
        },
      },
    },
  });
  renderApp('/account');
  expect(await screen.findByRole('radio', { name: /^Dark/ })).toHaveProperty('checked', true);
  fireEvent.click(screen.getByRole('radio', { name: /Same as this device/ }));
  expect(localStorage.getItem('tb-appearance')).toBeNull();
  expect(screen.getByRole('radio', { name: /Same as this device/ })).toHaveProperty(
    'checked',
    true,
  );
});
