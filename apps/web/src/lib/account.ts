import type { Account, ChangePasswordBody, TripPath, UpdateAccountBody } from '@tb/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from './api.ts';
import { ME_QUERY_KEY } from './auth.ts';

const ACCOUNT_KEY = ['account'] as const;

export function useAccount({ enabled = true } = {}) {
  return useQuery({
    enabled,
    queryKey: ACCOUNT_KEY,
    queryFn: async () => (await apiFetch<{ account: Account }>('/account')).account,
  });
}

/** Every place the trips have reached, per book, for the world map. */
export function usePlaces() {
  return useQuery({
    queryKey: ['places'],
    queryFn: async () => (await apiFetch<{ trips: TripPath[] }>('/account/places')).trips,
  });
}

/** Name or email; the header's name follows straight away. */
export function useUpdateAccount() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (body: UpdateAccountBody) =>
      (await apiFetch<{ account: Account }>('/account', { method: 'PATCH', json: body })).account,
    onSuccess: (account) => {
      queryClient.setQueryData(ACCOUNT_KEY, account);
      queryClient.setQueryData(ME_QUERY_KEY, account.user);
    },
  });
}

/** Signs out every other device; this one stays signed in. */
export function useChangePassword() {
  return useMutation({
    mutationFn: (body: ChangePasswordBody) =>
      apiFetch<void>('/account/password', { method: 'PUT', json: body }),
  });
}

export function useSignOutOthers() {
  return useMutation({
    mutationFn: () =>
      apiFetch<void>('/account/sessions/sign-out-others', { method: 'POST', json: {} }),
  });
}

/** Deletes everything; afterwards nothing private stays in the cache. */
export function useDeleteAccount() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (password: string) =>
      apiFetch<void>('/account', { method: 'DELETE', json: { password } }),
    onSuccess: () => {
      queryClient.clear();
      queryClient.setQueryData(ME_QUERY_KEY, null);
    },
  });
}
