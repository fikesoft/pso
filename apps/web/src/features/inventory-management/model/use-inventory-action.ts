import axios from 'axios';
import { useEffect, useRef, useState } from 'react';
import { errorMessage } from '@pos/ui/api';
import type { InventoryActionOptions } from './inventory.types';
export function useInventoryAction<Input, Output>({
  operation,
  onSaved,
  isConfirmedUncommitted,
}: InventoryActionOptions<Input, Output>) {
  const [busy, setBusy] = useState(false);
  const [uncertain, setUncertain] = useState(false);
  const [stale, setStale] = useState(false);
  const [error, setError] = useState('');
  const request = useRef<Input | null>(null);
  const unconfirmed = useRef(false);
  const pending = useRef(false);
  const lifetime = useRef(0);
  useEffect(
    () => () => {
      lifetime.current++;
    },
    [],
  );
  async function submit(input: Input) {
    if (pending.current || stale) return;
    const current = lifetime.current;
    request.current ??= input;
    pending.current = true;
    setBusy(true);
    setError('');
    try {
      const result = await operation(request.current);
      if (current !== lifetime.current) return;
      request.current = null;
      unconfirmed.current = false;
      setUncertain(false);
      onSaved(result);
    } catch (error) {
      if (current !== lifetime.current) return;
      // A later access refusal does not prove that the original request rolled back.
      const unknown =
        !isConfirmedUncommitted?.(error) &&
        (unconfirmed.current ||
          !axios.isAxiosError(error) ||
          !error.response ||
          error.response.status >= 500);
      unconfirmed.current = unknown;
      setUncertain(unknown);
      setStale(!unknown && axios.isAxiosError(error) && error.response?.status === 409);
      setError(errorMessage(error));
      if (!unknown) request.current = null;
    } finally {
      pending.current = false;
      if (current === lifetime.current) setBusy(false);
    }
  }
  function resetError() {
    if (!uncertain && !busy) {
      setError('');
      setStale(false);
    }
  }
  return { busy, uncertain, stale, error, setError, submit, resetError, locked: busy || uncertain };
}
