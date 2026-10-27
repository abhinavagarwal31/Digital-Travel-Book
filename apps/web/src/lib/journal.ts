import { daySet, resolveChapters, type Book, type Chapter, type Photo } from '@tb/shared';
import { useQueryClient } from '@tanstack/react-query';
import { useRef } from 'react';
import { apiFetch } from './api.ts';
import { photosKey } from './photos.ts';

/**
 * Caption and diary writes for autosave. Each answer updates the cache in
 * place instead of refetching, so text being typed elsewhere is never reset.
 */
export function useJournal(bookId: string) {
  const queryClient = useQueryClient();
  // Chapter saves send the whole list, so they run one at a time: each starts
  // from the answer to the one before and cannot undo it.
  const chapterQueue = useRef<Promise<unknown>>(Promise.resolve());

  async function saveCaption(photoId: string, caption: string) {
    const { photo } = await apiFetch<{ photo: Photo }>(`/photos/${photoId}/caption`, {
      method: 'PUT',
      json: { caption },
    });
    queryClient.setQueryData<Photo[]>(photosKey(bookId), (photos) =>
      photos?.map((p) => (p.id === photo.id ? photo : p)),
    );
  }

  async function saveDiary(date: string, diary: string) {
    const { book } = await apiFetch<{ book: Book }>(`/books/${bookId}/days/${date}/diary`, {
      method: 'PUT',
      json: { diary },
    });
    queryClient.setQueryData(['books', bookId], book);
  }

  /**
   * The chapters as the Write page shows them: every day of the book placed,
   * read from the cache at the moment of saving, so a title typed just after
   * a split or merge is applied to the new shape, not the old one.
   */
  function currentChapters(): Chapter[] {
    const book = queryClient.getQueryData<Book>(['books', bookId]);
    const photos = queryClient.getQueryData<Photo[]>(photosKey(bookId)) ?? [];
    if (!book) return [];
    const days = daySet(
      {
        startDate: book.startDate,
        endDate: book.endDate,
        diaryDates: book.days.map((d) => d.date),
        chapters: book.chapters,
      },
      photos.filter((p) => p.status === 'ready'),
    );
    return resolveChapters(book.chapters, days);
  }

  /** Saves the chapters after a change: a rename, split or merge of the current ones. */
  function saveChapters(change: (chapters: Chapter[]) => Chapter[]) {
    const run = chapterQueue.current.then(async () => {
      const { book } = await apiFetch<{ book: Book }>(`/books/${bookId}/chapters`, {
        method: 'PUT',
        json: { chapters: change(currentChapters()) },
      });
      queryClient.setQueryData(['books', bookId], book);
    });
    // A failed save does not block the ones after it; its caller sees the error.
    chapterQueue.current = run.catch(() => {});
    return run;
  }

  async function savePhotoOrder(date: string, photoIds: string[]) {
    const { book } = await apiFetch<{ book: Book }>(`/books/${bookId}/days/${date}/photo-order`, {
      method: 'PUT',
      json: { photoIds },
    });
    queryClient.setQueryData(['books', bookId], book);
  }

  return { saveCaption, saveDiary, saveChapters, savePhotoOrder };
}
