import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { vi } from 'vitest';
import { App } from '../App.tsx';

type Reply = { status: number; body?: unknown };
type Route = Reply | ((body: unknown) => Reply);

export interface ApiCall {
  method: string;
  path: string;
  body: unknown;
}

/**
 * Replaces fetch with a tiny fake API keyed by "METHOD /path" (without /api).
 * Unknown routes answer 404 like the real server. Returns the calls made.
 */
export function mockApi(routes: Record<string, Route>): ApiCall[] {
  const calls: ApiCall[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const method = init?.method ?? 'GET';
      const path = String(input).replace(/^\/api/, '');
      const body = init?.body ? JSON.parse(String(init.body)) : undefined;
      calls.push({ method, path, body });

      const route = routes[`${method} ${path}`];
      const reply = !route
        ? { status: 404, body: { error: { code: 'NOT_FOUND', message: 'Not found' } } }
        : typeof route === 'function'
          ? route(body)
          : route;
      return reply.status === 204
        ? new Response(null, { status: 204 })
        : new Response(JSON.stringify(reply.body), { status: reply.status });
    }),
  );
  return calls;
}

export function renderApp(path: string) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[path]}>
        <App />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

export const ASHA = {
  id: '64b7f0c2a1d3e4f5a6b7c8d9',
  name: 'Asha',
  email: 'asha@example.com',
  createdAt: '2026-10-01T00:00:00.000Z',
};

export const JAPAN_BOOK = {
  id: '64b7f0c2a1d3e4f5a6b7c8e0',
  title: 'Whispers of Japan',
  description: '',
  startDate: '2026-10-10',
  endDate: '2026-10-15',
  defaultTz: 'Asia/Tokyo',
  destinations: ['Tokyo', 'Kyoto'],
  theme: { kind: 'preset', id: 'editorial', version: 1 },
  days: [],
  chapters: [],
  chaptersEdited: false,
  overrides: { coverPhotoId: null, dayLayouts: [] },
  createdAt: '2026-10-01T00:00:00.000Z',
  updatedAt: '2026-10-01T00:00:00.000Z',
};

export const UNAUTHENTICATED = {
  status: 401,
  body: { error: { code: 'UNAUTHENTICATED', message: 'Please log in' } },
};
