import type { Book, CreateBookBody, PhotoLayout, ThemeId, UpdateBookBody } from '@tb/shared';
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

/** Picks a theme; the book moves to that theme's newest version. */
export function useSetTheme(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (theme: ThemeId) =>
      (
        await apiFetch<{ book: Book }>(`/books/${id}/theme`, {
          method: 'PUT',
          json: { id: theme },
        })
      ).book,
    onSuccess: (book) => {
      queryClient.setQueryData(bookKey(id), book);
      void queryClient.invalidateQueries({ queryKey: BOOKS_KEY, exact: true });
    },
  });
}

/** Chooses the cover photo, or null for the plain cloth cover. */
export function useSetCover(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (photoId: string | null) =>
      (await apiFetch<{ book: Book }>(`/books/${id}/cover`, { method: 'PUT', json: { photoId } }))
        .book,
    onSuccess: (book) => queryClient.setQueryData(bookKey(id), book),
  });
}

/** Chooses how many photos share a page on one day, or null to follow the theme. */
export function useSetDayLayout(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ date, layout }: { date: string; layout: PhotoLayout | null }) =>
      (
        await apiFetch<{ book: Book }>(`/books/${id}/day-layouts/${date}`, {
          method: 'PUT',
          json: { layout },
        })
      ).book,
    onSuccess: (book) => queryClient.setQueryData(bookKey(id), book),
  });
}
