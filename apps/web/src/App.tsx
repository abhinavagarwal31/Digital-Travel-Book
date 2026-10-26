import { useQuery } from '@tanstack/react-query';
import { Link, Route, Routes } from 'react-router';
import { getHealth } from './lib/api.ts';

function ApiStatus() {
  const health = useQuery({ queryKey: ['health'], queryFn: getHealth, retry: false });

  if (health.isPending) return <p role="status">Checking the server…</p>;
  if (health.isError) return <p role="status">Server unreachable</p>;
  return (
    <p role="status">
      {health.data.db === 'up' ? 'Server connected' : 'Server up, database unavailable'}
    </p>
  );
}

function HomePage() {
  return (
    <main>
      <h1>Digital Travel Book</h1>
      <ApiStatus />
    </main>
  );
}

function NotFoundPage() {
  return (
    <main>
      <h1>Page not found</h1>
      <Link to="/">Back to home</Link>
    </main>
  );
}

export function App() {
  return (
    <Routes>
      <Route path="/" element={<HomePage />} />
      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  );
}
