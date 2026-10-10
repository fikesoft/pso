import axios from 'axios';
import { useEffect, useRef, useState } from 'react';
import type { OrderDeliveryFeeCommand } from '@pos/contracts';
import { errorMessage } from '@pos/ui/api';
import { orderDeliveryFeeMessages as text } from '@pos/ui/locales';
import { applyOrderDeliveryFee, resolveOrderDeliveryFee } from '../../../entities/order';
import {
  clearDeliveryFeePointer,
  readDeliveryFeePointer,
  storeDeliveryFeePointer,
} from '../lib/delivery-fee-pointer';
import type { DeliveryFeeInput } from './delivery-fee.types';
export function useDeliveryFeeCommand({ model, isBlocked }: DeliveryFeeInput) {
  const order = model.selected!;
  const key = `pos.order-delivery-fee:${model.organizationId}:${model.actorUserId}:${order.locationId}:${order.id}`;
  const [ready, setReady] = useState(false),
    [busy, setBusy] = useState(false),
    [recovering, setRecovering] = useState(false),
    [stale, setStale] = useState(false);
  const [error, setError] = useState(''),
    [notice, setNotice] = useState('');
  const pointer = useRef<string | null>(null),
    attempt = useRef<OrderDeliveryFeeCommand | null>(null);
  const pending = useRef(false),
    unknown = useRef(false),
    mounted = useRef(false);
  useEffect(() => {
    mounted.current = true;
    try {
      pointer.current = readDeliveryFeePointer(key);
      unknown.current = !!pointer.current;
      setRecovering(unknown.current);
      setReady(true);
    } catch (failure) {
      setError(errorMessage(failure));
    }
    return () => {
      mounted.current = false;
    };
  }, [key]);
  function clear() {
    if (pointer.current) clearDeliveryFeePointer(key, pointer.current);
    pointer.current = null;
    attempt.current = null;
    unknown.current = false;
    if (mounted.current) setRecovering(false);
  }
  async function send(body?: OrderDeliveryFeeCommand) {
    if (
      !ready ||
      !model.canCreate ||
      !model.canRead ||
      pending.current ||
      stale ||
      isBlocked() ||
      (pointer.current && !attempt.current)
    )
      return;
    if (!attempt.current) {
      if (!body || pointer.current) return;
      attempt.current = structuredClone(body);
      pointer.current = body.requestKey;
    }
    pending.current = true;
    setBusy(true);
    setError('');
    setNotice('');
    let sent = false;
    try {
      storeDeliveryFeePointer(key, pointer.current!);
      sent = true;
      const response = await applyOrderDeliveryFee(model.api, order.id, attempt.current);
      clear();
      if (mounted.current) {
        model.updated(response.order);
        setNotice(text.saved);
      }
    } catch (failure) {
      const status = axios.isAxiosError(failure) ? failure.response?.status : undefined;
      unknown.current = unknown.current || !sent || !status || status >= 500;
      if (!unknown.current) {
        try {
          clear();
        } catch {
          unknown.current = true;
        }
        if (mounted.current) setStale(true);
      }
      if (mounted.current) {
        setRecovering(unknown.current);
        setError(errorMessage(failure));
        if (status === 401 || status === 403) void model.selection.refresh();
      }
    } finally {
      pending.current = false;
      if (mounted.current) setBusy(false);
    }
  }
  async function resolve() {
    if (
      !ready ||
      !model.canCreate ||
      !model.canRead ||
      pending.current ||
      !pointer.current ||
      model.externalBlocked()
    )
      return;
    pending.current = true;
    setBusy(true);
    setError('');
    try {
      const response = await resolveOrderDeliveryFee(model.api, order.id, pointer.current);
      clear();
      if (mounted.current) {
        setStale(false);
        model.updated(response.order);
        setNotice(response.status === 'SUCCEEDED' ? text.saved : text.retired);
      }
    } catch (failure) {
      if (mounted.current) setError(errorMessage(failure));
    } finally {
      pending.current = false;
      if (mounted.current) setBusy(false);
    }
  }
  return {
    ready,
    busy,
    recovering,
    stale,
    error,
    notice,
    send,
    resolve,
    hasAttempt: !!attempt.current,
    isPending: () => pending.current || unknown.current,
    locked: !ready || busy || recovering,
    refreshed: () => {
      if (!pending.current && !pointer.current) {
        setStale(false);
        setError('');
      }
    },
  };
}
