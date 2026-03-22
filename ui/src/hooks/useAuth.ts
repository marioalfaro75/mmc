'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { fetchApi } from '@/lib/utils/fetchApi';

interface AuthState {
  authenticated: boolean;
  username?: string;
  hasAdmins: boolean;
}

export function useAuth() {
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery<AuthState>({
    queryKey: ['auth-me'],
    queryFn: () => fetchApi<AuthState>('/api/auth/me'),
    staleTime: 5 * 60_000,
    retry: false,
  });

  const loginMutation = useMutation({
    mutationFn: ({ username, password }: { username: string; password: string }) =>
      fetchApi('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['auth-me'] });
    },
  });

  const logoutMutation = useMutation({
    mutationFn: () =>
      fetchApi('/api/auth/logout', { method: 'POST' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['auth-me'] });
    },
  });

  return {
    isAdmin: data?.authenticated ?? false,
    username: data?.username ?? null,
    hasAdmins: data?.hasAdmins ?? false,
    isLoading,
    login: loginMutation,
    logout: logoutMutation,
  };
}
