import { useCallback, useEffect, useState } from 'react';
import { api, ApiError } from '../api/client';

export interface Resource<T> {
  data: T | null;
  error: ApiError | null;
  loading: boolean;
  reload: () => void;
}

/**
 * Reads an endpoint, and re-reads it when asked.
 *
 * Deliberately small: the service worker is what makes a read work offline, so there is no
 * client-side cache here to disagree with it.
 */
export function useResource<T>(path: string | null): Resource<T> {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [loading, setLoading] = useState(path !== null);
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    if (path === null) {
      setData(null);
      setLoading(false);
      return;
    }

    const controller = new AbortController();
    setLoading(true);

    api
      .get<T>(path, controller.signal)
      .then((result) => {
        setData(result);
        setError(null);
      })
      .catch((cause: unknown) => {
        if (cause instanceof DOMException && cause.name === 'AbortError') return;
        setError(cause instanceof ApiError ? cause : new ApiError(0, 'internal_error', 'failed'));
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });

    return () => controller.abort();
  }, [path, nonce]);

  const reload = useCallback(() => setNonce((value) => value + 1), []);
  return { data, error, loading, reload };
}

/**
 * Whether the browser thinks it has a connection.
 *
 * With a network-first service worker a cached read succeeds silently offline, so this is
 * what tells the interface to admit the data may be old.
 */
export function useOnline(): boolean {
  const [online, setOnline] = useState(() => navigator.onLine);

  useEffect(() => {
    const goOnline = () => setOnline(true);
    const goOffline = () => setOnline(false);
    window.addEventListener('online', goOnline);
    window.addEventListener('offline', goOffline);
    return () => {
      window.removeEventListener('online', goOnline);
      window.removeEventListener('offline', goOffline);
    };
  }, []);

  return online;
}

/** Runs an action, keeping its pending and error state, for form submits. */
export function useAction<TArgs extends unknown[]>(
  action: (...args: TArgs) => Promise<unknown>,
): {
  run: (...args: TArgs) => Promise<boolean>;
  pending: boolean;
  error: ApiError | null;
  reset: () => void;
} {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);

  const run = useCallback(
    async (...args: TArgs) => {
      setPending(true);
      setError(null);
      try {
        await action(...args);
        return true;
      } catch (cause) {
        setError(cause instanceof ApiError ? cause : new ApiError(0, 'internal_error', 'failed'));
        return false;
      } finally {
        setPending(false);
      }
    },
    [action],
  );

  return { run, pending, error, reset: () => setError(null) };
}

/** Today in the user's zone, recomputed when the tab regains focus over midnight. */
export function useToday(timeZone: string): string {
  const compute = useCallback(
    () =>
      new Intl.DateTimeFormat('en-CA', {
        timeZone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      }).format(new Date()),
    [timeZone],
  );

  const [today, setToday] = useState(compute);

  useEffect(() => {
    setToday(compute());
    const onFocus = () => setToday(compute());
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [compute]);

  return today;
}
