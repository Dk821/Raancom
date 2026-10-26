import { DependencyList, useCallback, useEffect, useRef, useState } from 'react';
import { ApiError } from '../api/client';

export interface AsyncState<T> {
  data: T | null;
  error: string | null;
  loading: boolean;
  reload: () => void;
  setData: (d: T | null) => void;
}

/** Runs `fn` on mount and whenever `deps` change; ignores results from stale runs. */
export function useAsync<T>(fn: () => Promise<T>, deps: DependencyList): AsyncState<T> {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const run = useRef(0);

  const load = useCallback(() => {
    const id = ++run.current;
    setLoading(true);
    setError(null);
    fn()
      .then((d) => {
        if (id === run.current) setData(d);
      })
      .catch((e) => {
        if (id === run.current) setError(e instanceof ApiError ? e.message : 'Something went wrong');
      })
      .finally(() => {
        if (id === run.current) setLoading(false);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  useEffect(() => {
    load();
  }, [load]);

  return { data, error, loading, reload: load, setData };
}

export function errMsg(e: unknown): string {
  return e instanceof ApiError ? e.message : e instanceof Error ? e.message : 'Something went wrong';
}
