import { Link } from 'react-router';

export function NotFoundPage() {
  return (
    <section className="card narrow">
      <h1>Page not found</h1>
      <p className="muted">This page does not exist, or it belongs to another account.</p>
      <Link to="/">Back to my books</Link>
    </section>
  );
}
