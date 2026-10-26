import type { Photo } from '@tb/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from './api.ts';

export const photosKey = (bookId: string) => ['books', bookId, 'photos'] as const;

export function usePhotos(bookId: string) {
  return useQuery({
    queryKey: photosKey(bookId),
    queryFn: async () => (await apiFetch<{ photos: Photo[] }>(`/books/${bookId}/photos`)).photos,
  });
}

export function useDeletePhoto(bookId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (photoId: string) => apiFetch<void>(`/photos/${photoId}`, { method: 'DELETE' }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: photosKey(bookId) }),
  });
}

/** Same-origin image URL; the API checks ownership on every request. */
export function photoImageUrl(photoId: string, variant: 'thumb' | 'page' | 'cover'): string {
  return `/api/photos/${photoId}/image/${variant}`;
}

export interface DayGroup {
  dayDate: string | null;
  photos: Photo[];
}

// Sorts after any real "YYYY-MM-DDTHH:mm:ss", so photos without a time end each day.
const AFTER_ANY_TIME = '\uffff';

/** Ready photos grouped by day in date order; photos without a day come last. */
export function groupByDay(photos: Photo[]): DayGroup[] {
  const groups = new Map<string | null, Photo[]>();
  for (const photo of photos) {
    if (photo.status !== 'ready') continue;
    const list = groups.get(photo.dayDate) ?? [];
    list.push(photo);
    groups.set(photo.dayDate, list);
  }
  return [...groups.entries()]
    .sort(([a], [b]) => (a === null ? 1 : b === null ? -1 : a.localeCompare(b)))
    .map(([dayDate, list]) => ({
      dayDate,
      photos: list.sort((x, y) =>
        (x.localDateTime ?? AFTER_ANY_TIME).localeCompare(y.localDateTime ?? AFTER_ANY_TIME),
      ),
    }));
}
