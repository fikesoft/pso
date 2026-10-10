import { useCallback, useEffect, useRef, useState } from 'react';
import { errorMessage } from '@pos/ui/api';
export function useRemoteData<T>(load: () => Promise<T>) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const revision = useRef(0);
  const pendingPage = useRef(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const mounted = useRef(false);
  const revalidate = useCallback(
    async (read: () => Promise<T>, clearOnError?: (error: unknown) => boolean) => {
      const current = ++revision.current;
      try {
        const next = await read();
        if (mounted.current && current === revision.current) {
          setData(next);
          setError('');
        }
      } catch (error) {
        if (mounted.current && current === revision.current) {
          setError(errorMessage(error));
          if (clearOnError?.(error)) setData(null);
        }
      } finally {
        if (mounted.current && current === revision.current) setLoading(false);
      }
    },
    [],
  );
  const refresh = useCallback(async () => {
    const current = ++revision.current;
    setLoading(true);
    setError('');
    try {
      const next = await load();
      if (mounted.current && current === revision.current) {
        setData(next);
        return next;
      }
    } catch (error) {
      if (mounted.current && current === revision.current) setError(errorMessage(error));
    } finally {
      if (mounted.current && current === revision.current) setLoading(false);
    }
  }, [load]);
  async function append<P>(loadPage: () => Promise<P>, merge: (current: T, page: P) => T) {
    if (pendingPage.current || !mounted.current) return;
    pendingPage.current = true;
    setError('');
    setLoadingMore(true);
    const current = revision.current;
    try {
      const page = await loadPage();
      if (mounted.current && current === revision.current)
        setData((value) => (value ? merge(value, page) : value));
    } catch (error) {
      if (mounted.current && current === revision.current) setError(errorMessage(error));
    } finally {
      pendingPage.current = false;
      if (mounted.current) setLoadingMore(false);
    }
  }
  useEffect(() => {
    mounted.current = true;
    setData(null);
    void refresh();
    return () => {
      mounted.current = false;
      revision.current++;
    };
  }, [refresh]);
  return { data, setData, loading, loadingMore, error, setError, refresh, append, revalidate };
}
