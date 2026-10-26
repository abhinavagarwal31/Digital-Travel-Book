import { Link, Outlet, useNavigate } from 'react-router';
import { useCurrentUser, useLogout } from '../lib/auth.ts';

export function Layout() {
  const me = useCurrentUser();
  const logout = useLogout();
  const navigate = useNavigate();

  return (
    <div className="app">
      <header className="app-header">
        <Link to="/" className="brand">
          Digital Travel Book
        </Link>
        {me.data && (
          <div className="account">
            <span className="muted">{me.data.name}</span>
            <button
              type="button"
              className="button ghost"
              disabled={logout.isPending}
              onClick={() =>
                logout.mutate(undefined, { onSuccess: () => navigate('/login', { replace: true }) })
              }
            >
              Log out
            </button>
          </div>
        )}
      </header>
      <main className="content">
        <Outlet />
      </main>
    </div>
  );
}
