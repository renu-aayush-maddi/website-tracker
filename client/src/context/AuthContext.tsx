import { useQuery, useQueryClient } from '@tanstack/react-query';
import { createContext, useCallback, useContext, useEffect, useMemo, type ReactNode } from 'react';
import type { LoginInput, SetupInput, UserDto } from '@wt/shared';
import { ApiError, api, onUnauthorized } from '../services/api';

interface AuthContextValue {
  user: UserDto | null;
  loading: boolean;
  error: unknown;
  retry: () => void;
  login: (input: LoginInput) => Promise<UserDto>;
  setup: (input: SetupInput) => Promise<UserDto>;
  logout: () => Promise<void>;
  setUser: (user: UserDto) => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);
const ME_KEY = ['me'] as const;

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const me = useQuery({
    queryKey: ME_KEY,
    queryFn: async () => {
      try {
        return await api.auth.me();
      } catch (err) {
        if (err instanceof ApiError && err.status === 401) return null;
        throw err;
      }
    },
    retry: false,
    staleTime: Number.POSITIVE_INFINITY,
  });

  const signOutLocally = useCallback(() => {
    queryClient.removeQueries({ predicate: (q) => q.queryKey[0] !== ME_KEY[0] });
    queryClient.setQueryData(ME_KEY, null);
  }, [queryClient]);

  // A 401 from any request (expired or revoked session) signs the UI out.
  useEffect(() => onUnauthorized(signOutLocally), [signOutLocally]);

  const value = useMemo<AuthContextValue>(
    () => ({
      user: me.data ?? null,
      loading: me.isPending,
      error: me.error,
      retry: () => void me.refetch(),
      login: async (input) => {
        const user = await api.auth.login(input);
        queryClient.setQueryData(ME_KEY, user);
        return user;
      },
      setup: async (input) => {
        const user = await api.auth.setup(input);
        queryClient.setQueryData(ME_KEY, user);
        return user;
      },
      logout: async () => {
        try {
          await api.auth.logout();
        } finally {
          signOutLocally();
        }
      },
      setUser: (user) => queryClient.setQueryData(ME_KEY, user),
    }),
    [me, queryClient, signOutLocally],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
