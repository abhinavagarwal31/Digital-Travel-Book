import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router';
import { App } from './App.tsx';
import { ApiRequestError } from './lib/api.ts';
import '@fontsource-variable/fraunces';
import '@fontsource-variable/inter';
import './styles.css';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // A 4xx (not found, logged out, invalid) will not change on retry; only
      // network failures and 5xx get two more tries.
      retry: (failures, err) =>
        !(err instanceof ApiRequestError && err.status < 500) && failures < 2,
    },
  },
});

const root = document.getElementById('root');
if (!root) throw new Error('Missing #root element in index.html');

createRoot(root).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </QueryClientProvider>
  </StrictMode>,
);
