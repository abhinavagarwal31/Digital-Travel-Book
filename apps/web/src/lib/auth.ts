import type { LoginBody, RegisterBody, User } from '@tb/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch, ApiRequestError } from './api.ts';

export const ME_QUERY_KEY = ['me'] as const;

/** The logged-in user, or null when there is no valid session cookie. */
async function fetchCurrentUser(): Promise<User | null> {
  try {
    return (await apiFetch<{ user: User }>('/auth/me')).user;
  } catch (err) {
    if (err instanceof ApiRequestError && err.status === 401) return null;
    throw err;
  }
}

export function useCurrentUser() {
  return useQuery({ queryKey: ME_QUERY_KEY, queryFn: fetchCurrentUser, staleTime: Infinity });
}

export function useLogin() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (body: LoginBody) =>
      (await apiFetch<{ user: User }>('/auth/login', { method: 'POST', json: body })).user,
    onSuccess: (user) => queryClient.setQueryData(ME_QUERY_KEY, user),
  });
}

export function useRegister() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (body: RegisterBody) =>
      (await apiFetch<{ user: User }>('/auth/register', { method: 'POST', json: body })).user,
    onSuccess: (user) => queryClient.setQueryData(ME_QUERY_KEY, user),
  });
}

export function useLogout() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => apiFetch<void>('/auth/logout', { method: 'POST', json: {} }),
    onSuccess: () => {
      // Drop every cached private response, then mark the session as gone.
      queryClient.clear();
      queryClient.setQueryData(ME_QUERY_KEY, null);
    },
  });
}
