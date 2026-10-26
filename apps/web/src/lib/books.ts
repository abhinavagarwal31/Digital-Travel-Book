import type { Book, CreateBookBody, UpdateBookBody } from '@tb/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from './api.ts';

const BOOKS_KEY = ['books'] as const;
const bookKey = (id: string) => ['books', id] as const;

export function useBooks() {
  return useQuery({
    queryKey: BOOKS_KEY,
    queryFn: async () => (await apiFetch<{ books: Book[] }>('/books')).books,
  });
}

export function useBook(id: string) {
  return useQuery({
    queryKey: bookKey(id),
    queryFn: async () => (await apiFetch<{ book: Book }>(`/books/${id}`)).book,
  });
}

export function useCreateBook() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (body: CreateBookBody) =>
      (await apiFetch<{ book: Book }>('/books', { method: 'POST', json: body })).book,
    onSuccess: (book) => {
      queryClient.setQueryData(bookKey(book.id), book);
      void queryClient.invalidateQueries({ queryKey: BOOKS_KEY, exact: true });
    },
  });
}

export function useUpdateBook(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (changes: UpdateBookBody) =>
      (await apiFetch<{ book: Book }>(`/books/${id}`, { method: 'PATCH', json: changes })).book,
    onSuccess: (book) => {
      queryClient.setQueryData(bookKey(id), book);
      void queryClient.invalidateQueries({ queryKey: BOOKS_KEY, exact: true });
    },
  });
}

export function useDeleteBook(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => apiFetch<void>(`/books/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      queryClient.removeQueries({ queryKey: bookKey(id) });
      void queryClient.invalidateQueries({ queryKey: BOOKS_KEY, exact: true });
    },
  });
}
