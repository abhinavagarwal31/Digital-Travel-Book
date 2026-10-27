import { Route, Routes, useLocation } from 'react-router';
import { ErrorBoundary } from './components/ErrorBoundary.tsx';
import { Layout } from './components/Layout.tsx';
import { Loading } from './components/LoadState.tsx';
import { RequireAuth } from './components/RequireAuth.tsx';
import { useCurrentUser } from './lib/auth.ts';
import { AuthPage } from './pages/AuthPage.tsx';
import { BookPage } from './pages/BookPage.tsx';
import { LandingPage } from './pages/LandingPage.tsx';
import { LibraryPage } from './pages/LibraryPage.tsx';
import { NewBookPage } from './pages/NewBookPage.tsx';
import { NotFoundPage } from './pages/NotFoundPage.tsx';
import { ReaderPage } from './pages/ReaderPage.tsx';
import { SortPage } from './pages/SortPage.tsx';
import { WritePage } from './pages/WritePage.tsx';

/** "/" is the library for a logged-in user and the landing page for everyone else. */
function Home() {
  const me = useCurrentUser();
  if (me.isPending) return <Loading />;
  return me.data ? <LibraryPage /> : <LandingPage />;
}

/** The last line of defence: a rendering bug shows this, not a blank screen. */
function Crash() {
  return (
    <div className="crash" role="alert">
      <h1>Something went wrong</h1>
      <p className="muted">This page hit a problem. Everything you wrote and arranged is saved.</p>
      <div className="actions">
        <button type="button" className="button" onClick={() => location.reload()}>
          Reload the page
        </button>
        <a href="/" className="button ghost">
          Back to my books
        </a>
      </div>
    </div>
  );
}

export function App() {
  // A new page gets a fresh chance: an error on one page does not follow you to the next.
  const { pathname } = useLocation();
  return (
    <ErrorBoundary key={pathname} fallback={() => <Crash />}>
      <Routes>
        {/* The reader is full-screen: no app header around the book. */}
        <Route
          path="/books/:bookId/read"
          element={
            <RequireAuth>
              <ReaderPage />
            </RequireAuth>
          }
        />
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
          <Route
            path="/books/:bookId/sort"
            element={
              <RequireAuth>
                <SortPage />
              </RequireAuth>
            }
          />
          <Route
            path="/books/:bookId/write"
            element={
              <RequireAuth>
                <WritePage />
              </RequireAuth>
            }
          />
          <Route path="*" element={<NotFoundPage />} />
        </Route>
      </Routes>
    </ErrorBoundary>
  );
}
