import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { App } from './App.tsx';

function renderAt(path: string) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[path]}>
        <App />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

function mockHealth(status: number, body: unknown) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response(JSON.stringify(body), { status })),
  );
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('home page server status', () => {
  it('shows connected when the API and database are up', async () => {
    mockHealth(200, { status: 'ok', db: 'up' });
    renderAt('/');
    expect(await screen.findByText('Server connected')).toBeTruthy();
    expect(fetch).toHaveBeenCalledWith('/api/health', { credentials: 'same-origin' });
  });

  it('shows the database problem on a 503', async () => {
    mockHealth(503, { status: 'degraded', db: 'down' });
    renderAt('/');
    expect(await screen.findByText('Server up, database unavailable')).toBeTruthy();
  });

  it('shows unreachable when the request fails', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new TypeError('Failed to fetch');
      }),
    );
    renderAt('/');
    expect(await screen.findByText('Server unreachable')).toBeTruthy();
  });
});

describe('routing', () => {
  it('shows a not-found page for unknown paths', () => {
    mockHealth(200, { status: 'ok', db: 'up' });
    renderAt('/no/such/page');
    expect(screen.getByRole('heading', { name: 'Page not found' })).toBeTruthy();
  });
});
