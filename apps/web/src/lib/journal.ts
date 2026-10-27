import type { Book, Photo } from '@tb/shared';
import { useQueryClient } from '@tanstack/react-query';
import { apiFetch } from './api.ts';
import { photosKey } from './photos.ts';

/**
 * Caption and diary writes for autosave. Each answer updates the cache in
 * place instead of refetching, so text being typed elsewhere is never reset.
 */
export function useJournal(bookId: string) {
  const queryClient = useQueryClient();

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

  return { saveCaption, saveDiary };
}
