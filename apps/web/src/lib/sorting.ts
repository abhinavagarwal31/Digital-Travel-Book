import type { Book, Photo, SortingSummary } from '@tb/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from './api.ts';
import { photosKey } from './photos.ts';

type Expect = Record<string, { dayDate: string | null; assignedBy: 'auto' | 'user' }>;

interface SortResponse {
  book: Book;
  summary: SortingSummary;
}

/** Reverses a completed sorting action. */
export type Undo = () => Promise<void>;

function expectOf(photos: Photo[]): Expect {
  return Object.fromEntries(
    photos.map((p) => [p.id, { dayDate: p.dayDate, assignedBy: p.assignedBy }]),
  );
}

function byDay(photos: Photo[]): Map<string | null, Photo[]> {
  const groups = new Map<string | null, Photo[]>();
  for (const p of photos) groups.set(p.dayDate, [...(groups.get(p.dayDate) ?? []), p]);
  return groups;
}

/**
 * Every sorting call refreshes the book (chapters may change) and its photos.
 * An undo sends the state the action left behind as `expect`, so it is refused
 * (409) instead of overwriting anything changed since, e.g. in another tab.
 */
export function useSorting(bookId: string) {
  const queryClient = useQueryClient();

  const call = async (path: string, method: 'POST' | 'PUT', json: unknown) => {
    const res = await apiFetch<SortResponse>(path, { method, json });
    queryClient.setQueryData(['books', bookId], res.book);
    await queryClient.invalidateQueries({ queryKey: photosKey(bookId) });
    return res;
  };

  /** The photos as the server now has them (the cache was just refetched). */
  const current = (ids: string[]): Photo[] => {
    const all = queryClient.getQueryData<Photo[]>(photosKey(bookId)) ?? [];
    return all.filter((p) => ids.includes(p.id));
  };

  const setDay = (photoIds: string[], dayDate: string | null, expect?: Expect) =>
    call(`/books/${bookId}/photos/day`, 'PUT', { photoIds, dayDate, ...(expect && { expect }) });

  const resetDay = (photoIds: string[], expect?: Expect) =>
    call(`/books/${bookId}/photos/day-reset`, 'POST', { photoIds, ...(expect && { expect }) });

  const ids = (photos: Photo[]) => photos.map((p) => p.id);

  /** Moves photos to a day, or to no day; undo puts each back exactly as it was. */
  const move = useMutation({
    mutationFn: async ({ photos, dayDate }: { photos: Photo[]; dayDate: string | null }) => {
      await setDay(ids(photos), dayDate);
      const undo: Undo = async () => {
        const after = (list: Photo[]) =>
          expectOf(list.map((p) => ({ ...p, dayDate, assignedBy: 'user' })));
        const wasAuto = photos.filter((p) => p.assignedBy === 'auto');
        if (wasAuto.length > 0) await resetDay(ids(wasAuto), after(wasAuto));
        for (const [day, list] of byDay(photos.filter((p) => p.assignedBy === 'user'))) {
          await setDay(ids(list), day, after(list));
        }
      };
      return undo;
    },
  });

  /** Hands photos back to automatic placement; undo restores the user's own choices. */
  const reset = useMutation({
    mutationFn: async ({ photos }: { photos: Photo[] }) => {
      const placedByUser = photos.filter((p) => p.assignedBy === 'user');
      await resetDay(ids(photos));
      const leftBehind = expectOf(current(ids(placedByUser)));
      const undo: Undo = async () => {
        for (const [day, list] of byDay(placedByUser)) {
          const expect = Object.fromEntries(list.map((p) => [p.id, leftBehind[p.id]]));
          await setDay(ids(list), day, expect as Expect);
        }
      };
      return undo;
    },
  });

  /** Excludes photos from the book, or includes them again. */
  const setHidden = useMutation({
    mutationFn: async ({ photos, hidden }: { photos: Photo[]; hidden: boolean }) => {
      const path = `/books/${bookId}/photos/visibility`;
      await call(path, 'PUT', { photoIds: ids(photos), hidden });
      const undo: Undo = async () => {
        await call(path, 'PUT', { photoIds: ids(photos), hidden: !hidden });
      };
      return undo;
    },
  });

  /** Answers "does this location look wrong?"; undo restores the file's own position. */
  const location = useMutation({
    mutationFn: async ({ photo, action }: { photo: Photo; action: 'confirm' | 'remove' }) => {
      const path = `/photos/${photo.id}/location`;
      await call(path, 'PUT', { action });
      const undo: Undo = async () => {
        await call(path, 'PUT', { action: 'reset' });
      };
      return undo;
    },
  });

  const organize = useMutation({
    mutationFn: () => call(`/books/${bookId}/organize`, 'POST', {}),
  });

  return { move, reset, setHidden, location, organize };
}
