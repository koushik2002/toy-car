import { useEffect, useState } from 'react';
import { request } from './api';

export function useResource<T>(path: string | null) {
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<{
    data: T | null;
    error: Error | null;
    loading: boolean;
  }>({ data: null, error: null, loading: !!path });

  useEffect(() => {
    if (path !== '/auth/me') return;
    const refresh = () => setAttempt((value) => value + 1);
    window.addEventListener('tinykars-session-changed', refresh);
    return () => window.removeEventListener('tinykars-session-changed', refresh);
  }, [path]);

  useEffect(() => {
    const controller = new AbortController();
    if (!path) {
      setState({ data: null, error: null, loading: false });
      return;
    }
    setState({ data: null, error: null, loading: true });
    void request<T>(path, { signal: controller.signal }).then(
      (data) => {
        if (!controller.signal.aborted) setState({ data, error: null, loading: false });
      },
      (error: Error) => {
        if (!controller.signal.aborted) setState({ data: null, error, loading: false });
      },
    );
    return () => controller.abort();
  }, [path, attempt]);

  return { ...state, reload: () => setAttempt((value) => value + 1) };
}
