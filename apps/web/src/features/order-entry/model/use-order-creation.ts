import axios from 'axios';
import { useEffect, useRef, useState } from 'react';
import { errorMessage } from '@pos/ui/api';
import { orderCreationMessages as text } from '@pos/ui/locales';
import { createOrder, resolveOrderCreation } from '../../../entities/order';
import type { CreateOrderInput } from '../../../entities/order';
import {
  clearCreationPointer,
  readCreationPointer,
  storeCreationPointer,
} from '../lib/creation-pointer';
import type { OrderCreationInput, OrderCreationPointer } from './order-creation.types';
export function useOrderCreation(input: OrderCreationInput) {
  const { organizationId, actorUserId, locationId, enabled, api } = input;
  const [ready, setReady] = useState(false);
  const [recovering, setRecovering] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const pointer = useRef<OrderCreationPointer | null>(null);
  const payload = useRef<CreateOrderInput | null>(null);
  const uncertain = useRef(false);
  const pending = useRef(false);
  const mounted = useRef(false);
  useEffect(() => {
    mounted.current = true;
    try {
      if (enabled) {
        pointer.current = readCreationPointer(sessionStorage, {
          organizationId,
          actorUserId,
          locationId,
        });
        uncertain.current = !!pointer.current;
        setRecovering(!!pointer.current);
      }
      setReady(true);
    } catch {
      setError(text.storageError);
    }
    return () => {
      mounted.current = false;
    };
  }, [organizationId, actorUserId, locationId, enabled]);
  async function save(body: Omit<CreateOrderInput, 'requestKey'>) {
    if (!ready || pending.current || (pointer.current && !payload.current))
      throw new Error(text.recovery);
    payload.current ??= structuredClone({ ...body, requestKey: crypto.randomUUID() });
    pointer.current ??= {
      organizationId,
      actorUserId,
      locationId,
      requestKey: payload.current.requestKey,
    };
    pending.current = true;
    let sent = false;
    try {
      try {
        storeCreationPointer(sessionStorage, pointer.current);
      } catch {
        setError(text.storageError);
        throw new Error(text.storageError);
      }
      sent = true;
      const order = await createOrder(api, payload.current);
      clearCreationPointer(sessionStorage, pointer.current);
      pointer.current = null;
      payload.current = null;
      uncertain.current = false;
      if (mounted.current) {
        setRecovering(false);
        setError('');
      }
      return order;
    } catch (error) {
      uncertain.current =
        uncertain.current ||
        !sent ||
        (sent && (!axios.isAxiosError(error) || !error.response || error.response.status >= 500));
      if (!uncertain.current && sent) {
        try {
          clearCreationPointer(sessionStorage, pointer.current!);
          pointer.current = null;
          payload.current = null;
        } catch {
          uncertain.current = true;
        }
      }
      if (mounted.current) setRecovering(uncertain.current);
      throw error;
    } finally {
      pending.current = false;
    }
  }
  async function resolve() {
    if (!pointer.current || pending.current) return;
    pending.current = true;
    setBusy(true);
    setError('');
    try {
      const result = await resolveOrderCreation(api, {
        locationId,
        requestKey: pointer.current.requestKey,
      });
      if (
        (result.status !== 'CREATED' && result.status !== 'RETIRED') ||
        (result.status === 'CREATED' &&
          (!result.order?.id || result.order.locationId !== locationId)) ||
        (result.status === 'RETIRED' &&
          (result.locationId !== locationId || result.requestKey !== pointer.current.requestKey))
      )
        throw new Error(text.invalidResolution);
      clearCreationPointer(sessionStorage, pointer.current);
      pointer.current = null;
      payload.current = null;
      uncertain.current = false;
      if (!mounted.current) return;
      setRecovering(false);
      input.onSettled();
      if (result.status === 'CREATED') await input.onSaved(result.order);
      else setNotice(text.retired);
    } catch (error) {
      if (mounted.current) setError(errorMessage(error));
    } finally {
      pending.current = false;
      if (mounted.current) setBusy(false);
    }
  }
  return {
    save,
    resolve,
    busy,
    error,
    notice,
    recovering,
    ready,
    hasPayload: () => !!payload.current,
    isUncertain: () => uncertain.current,
  };
}
