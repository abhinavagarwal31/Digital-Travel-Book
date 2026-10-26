import type { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router';
import { useCurrentUser } from '../lib/auth.ts';

/** Renders its children only for a logged-in user; otherwise sends them to log in. */
export function RequireAuth({ children }: { children: ReactNode }) {
  const me = useCurrentUser();
  const location = useLocation();

  if (me.isPending) return <p className="muted">Loading…</p>;
  if (me.isError) return <p role="alert">Could not reach the server. Try reloading the page.</p>;
  if (!me.data) return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  return children;
}
