import { ReactNode, createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { api, hasToken, setToken } from '../api/client';
import { Me } from '../api/types';
import { setCompanyTimezone } from '../utils/format';

interface AuthState {
  user: Me | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<Me>;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
}

const Ctx = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<Me | null>(null);
  const [loading, setLoading] = useState(hasToken());

  const apply = useCallback((u: Me | null) => {
    if (u) setCompanyTimezone(u.company.timezone);
    setUser(u);
  }, []);

  const refresh = useCallback(async () => {
    try {
      apply(await api.get<Me>('/auth/me'));
    } catch {
      setToken(null);
      apply(null);
    }
  }, [apply]);

  useEffect(() => {
    if (hasToken()) refresh().finally(() => setLoading(false));
  }, [refresh]);

  useEffect(() => {
    const expired = () => {
      setToken(null);
      setUser(null);
    };
    const pw = () => setUser((u) => (u ? { ...u, must_change_password: true } : u));
    window.addEventListener('auth:expired', expired);
    window.addEventListener('auth:password-change', pw);
    return () => {
      window.removeEventListener('auth:expired', expired);
      window.removeEventListener('auth:password-change', pw);
    };
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const res = await api.post<{ access_token: string; user: Me }>('/auth/login', { email, password });
    setToken(res.access_token);
    apply(res.user);
    return res.user;
  }, [apply]);

  const logout = useCallback(async () => {
    try {
      await api.post('/auth/logout');
    } catch {
      /* already signed out server-side */
    }
    setToken(null);
    setUser(null);
  }, []);

  const value = useMemo(() => ({ user, loading, login, logout, refresh }), [user, loading, login, logout, refresh]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth(): AuthState {
  const v = useContext(Ctx);
  if (!v) throw new Error('useAuth outside AuthProvider');
  return v;
}
