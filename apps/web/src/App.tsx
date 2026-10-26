import { Route, Routes } from 'react-router';
import { Layout } from './components/Layout.tsx';
import { RequireAuth } from './components/RequireAuth.tsx';
import { useCurrentUser } from './lib/auth.ts';
import { AuthPage } from './pages/AuthPage.tsx';
import { BookPage } from './pages/BookPage.tsx';
import { LandingPage } from './pages/LandingPage.tsx';
import { LibraryPage } from './pages/LibraryPage.tsx';
import { NewBookPage } from './pages/NewBookPage.tsx';
import { NotFoundPage } from './pages/NotFoundPage.tsx';

/** "/" is the library for a logged-in user and the landing page for everyone else. */
function Home() {
  const me = useCurrentUser();
  if (me.isPending) return <p className="muted">Loading…</p>;
  return me.data ? <LibraryPage /> : <LandingPage />;
}

export function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route path="/login" element={<AuthPage mode="login" />} />
        <Route path="/register" element={<AuthPage mode="register" />} />
        <Route path="/" element={<Home />} />
        <Route
          path="/books/new"
          element={
            <RequireAuth>
              <NewBookPage />
            </RequireAuth>
          }
        />
        <Route
          path="/books/:bookId"
          element={
            <RequireAuth>
              <BookPage />
            </RequireAuth>
          }
        />
        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  );
}
