import { useNavigate } from 'react-router';
import { BookForm } from '../components/BookForm.tsx';
import { useCreateBook } from '../lib/books.ts';
import { browserTimeZone } from '../lib/dates.ts';

export function NewBookPage() {
  const createBook = useCreateBook();
  const navigate = useNavigate();

  return (
    <section className="card narrow">
      <h1>New travel book</h1>
      <p className="muted">One book per trip. You can change any of this later.</p>
      <BookForm
        initial={{
          title: '',
          startDate: '',
          endDate: '',
          defaultTz: browserTimeZone(),
          destinations: '',
          description: '',
        }}
        submitLabel="Create book"
        pendingLabel="Creating…"
        onSubmit={async (body) => {
          const book = await createBook.mutateAsync(body);
          navigate(`/books/${book.id}`, { replace: true });
        }}
        onCancel={() => navigate('/')}
      />
    </section>
  );
}
