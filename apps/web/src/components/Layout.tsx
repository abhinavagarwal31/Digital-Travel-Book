import { Link, Outlet, useNavigate } from 'react-router';
import { useCurrentUser, useLogout } from '../lib/auth.ts';
import { initials } from '../lib/names.ts';
import { BrandMark } from './BrandMark.tsx';

export function Layout() {
  const me = useCurrentUser();
  const logout = useLogout();
  const navigate = useNavigate();

  return (
    <div className="app">
      <header className="app-header">
        <Link to="/" className="brand">
          <BrandMark />
          Digital Travel Book
        </Link>
        {me.data ? (
          <div className="account">
            <Link to="/plans" className="header-link">
              Plans
            </Link>
            <Link
              to="/account"
              className="account-link"
              aria-label={`Your account: ${me.data.name}`}
            >
              <span className="avatar" aria-hidden="true">
                {initials(me.data.name)}
              </span>
              <span className="muted">{me.data.name}</span>
            </Link>
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
        ) : (
          me.isSuccess && (
            <div className="account">
              <Link to="/plans" className="header-link">
                Plans
              </Link>
              <Link to="/login" className="button ghost">
                Log in
              </Link>
              <Link to="/register" className="button">
                Get started
              </Link>
            </div>
          )
        )}
      </header>
      <main className="content">
        <Outlet />
      </main>
    </div>
  );
}
