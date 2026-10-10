import { useCallback, useEffect, useRef, useState } from 'react';
import { errorMessage } from '@pos/ui/api';
import { readOrder } from '../../../entities/order';
import { isAccessRejection, useCoalescedInvalidation, useInvalidation } from '../../../shared/lib';
import type { OrderSelectionInput } from './order-selection.types';
export function useOrderSelectionLive(input: OrderSelectionInput) {
  const { api, locationId, selected, setSelected, enabled } = input;
  const [blocked, setBlocked] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const current = useRef(input);
  current.current = input;
  const generation = useRef(0);
  const mounted = useRef(false);
  const id = selected?.id;
  useEffect(() => {
    mounted.current = true;
    generation.current++;
    setBlocked(false);
    setError('');
    setBusy(false);
    return () => {
      mounted.current = false;
      generation.current++;
    };
  }, [id, locationId]);
  const refresh = useCallback(async () => {
    const snapshot = current.current;
    if (!snapshot.selected) return;
    const orderId = snapshot.selected.id;
    const revision = ++generation.current;
    setBusy(true);
    try {
      const order = await readOrder(api, orderId);
      if (
        !mounted.current ||
        revision !== generation.current ||
        current.current.selected?.id !== orderId
      )
        return;
      if (current.current.selected.version > order.version) return;
      setBlocked(false);
      setError('');
      setSelected((value) =>
        value?.id === orderId && value.version <= order.version ? order : value,
      );
    } catch (error) {
      if (
        !mounted.current ||
        revision !== generation.current ||
        current.current.selected?.id !== orderId
      )
        return;
      if (isAccessRejection(error)) setBlocked(true);
      setError(errorMessage(error));
    } finally {
      if (mounted.current && revision === generation.current) setBusy(false);
    }
  }, [api, setSelected]);
  useEffect(() => {
    if (id && enabled) void refresh();
  }, [id, enabled, refresh]);
  const signal = useInvalidation(`orders:${locationId}`);
  useCoalescedInvalidation(signal, async () => {
    if (current.current.enabled) await refresh();
  });
  useEffect(() => {
    if (!enabled && id) {
      generation.current++;
      setBusy(false);
      setBlocked(true);
    }
  }, [enabled, id]);
  return { blocked, busy, error, refresh };
}
