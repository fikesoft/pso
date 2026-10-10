import { useEffect, useRef, useState } from 'react';
import { INVALIDATION_COALESCE_MS } from '../config/invalidation.constants';
export function useCoalescedInvalidation(signal: number, refresh: () => Promise<unknown>) {
  const [busy, setBusy] = useState(false);
  const current = useRef(refresh);
  current.current = refresh;
  const schedule = useRef<() => void>(() => {});
  useEffect(() => {
    let disposed = false;
    let pending = false;
    let dirty = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    async function run() {
      timer = undefined;
      if (disposed || pending || !dirty) return;
      dirty = false;
      pending = true;
      setBusy(true);
      try {
        await current.current();
      } finally {
        pending = false;
        if (!disposed) setBusy(false);
        if (dirty && !disposed) timer = setTimeout(() => void run(), INVALIDATION_COALESCE_MS);
      }
    }
    schedule.current = () => {
      dirty = true;
      if (!pending && !timer) timer = setTimeout(() => void run(), INVALIDATION_COALESCE_MS);
    };
    return () => {
      disposed = true;
      if (timer) clearTimeout(timer);
      schedule.current = () => {};
    };
  }, []);
  useEffect(() => {
    if (signal) schedule.current();
  }, [signal]);
  return busy;
}
