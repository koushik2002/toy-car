import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { request, type AccountUser, type SessionResult, type StoreConfig } from './api';

type SessionState = {
  user: AccountUser | null;
  csrfToken: string | null;
  config: StoreConfig | null;
  loading: boolean;
  error: Error | null;
  reload: () => void;
};

const Context = createContext<SessionState>({
  user: null,
  csrfToken: null,
  config: null,
  loading: true,
  error: null,
  reload: () => {},
});

/** One shared sign-in check for the whole app instead of a request per component. */
export function SessionProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<Omit<SessionState, 'reload'>>({
    user: null,
    csrfToken: null,
    config: null,
    loading: true,
    error: null,
  });
  const load = useCallback(() => {
    void Promise.all([request<SessionResult>('/auth/me'), request<StoreConfig>('/config')]).then(
      ([session, config]) => setState({ ...session, config, loading: false, error: null }),
      (error: Error) => setState((previous) => ({ ...previous, loading: false, error })),
    );
  }, []);
  useEffect(() => {
    load();
    window.addEventListener('tinykars-session-changed', load);
    return () => window.removeEventListener('tinykars-session-changed', load);
  }, [load]);
  return <Context.Provider value={{ ...state, reload: load }}>{children}</Context.Provider>;
}

export const useSession = () => useContext(Context);

export const isCustomer = (user: AccountUser | null) => user?.role === 'customer';
export const isManager = (user: AccountUser | null) =>
  user?.role === 'admin' || user?.role === 'super_admin';
export const isTeam = (user: AccountUser | null) => !!user && user.role !== 'customer';
