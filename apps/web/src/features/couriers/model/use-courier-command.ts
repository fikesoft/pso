import axios from 'axios';
import { useEffect, useRef, useState } from 'react';
import { errorMessage } from '@pos/ui/api';
import { courierMessages as text } from '@pos/ui/locales';
import { sendCourierCommand, resolveCourierCommand } from '../../../entities/courier';
import type { CourierAttempt } from '../../../entities/courier';
import {
  readCourierPointer,
  storeCourierPointer,
  clearCourierPointer,
  courierRecovery,
} from '../lib/courier-pointer';
import type { CourierCommandInput, CourierPointer } from './courier.types';
export function useCourierCommand(input: CourierCommandInput) {
  const { organizationId, actorUserId, locationId, enabled, api } = input;
  const [ready, setReady] = useState(false),
    [busy, setBusy] = useState(false),
    [recovering, setRecovering] = useState(false),
    [stale, setStale] = useState(false);
  const [error, setError] = useState(''),
    [notice, setNotice] = useState('');
  const pointer = useRef<CourierPointer | null>(null),
    attempt = useRef<CourierAttempt | null>(null);
  const pending = useRef(false),
    uncertain = useRef(false),
    mounted = useRef(false);
  useEffect(() => {
    mounted.current = true;
    try {
      pointer.current = readCourierPointer(sessionStorage, {
        organizationId,
        actorUserId,
        locationId,
      });
      uncertain.current = !!pointer.current;
      setRecovering(!!pointer.current);
      setReady(true);
    } catch {
      setError(text.storageError);
    }
    return () => {
      mounted.current = false;
    };
  }, [organizationId, actorUserId, locationId]);
  function clear() {
    if (pointer.current) clearCourierPointer(sessionStorage, pointer.current);
    pointer.current = null;
    attempt.current = null;
    uncertain.current = false;
    if (mounted.current) setRecovering(false);
  }
  async function settled(message: string) {
    clear();
    if (!mounted.current) return;
    setError('');
    setNotice(message);
    await input.onSettled();
  }
  async function send(value?: CourierAttempt) {
    if (!enabled || !ready || pending.current || stale || (pointer.current && !attempt.current))
      return false;
    if (!attempt.current) {
      if (!value || pointer.current) return false;
      attempt.current = structuredClone(value);
      pointer.current = {
        organizationId,
        actorUserId,
        locationId,
        courierId: value.courierId,
        requestKey: value.body.requestKey,
        action: value.body.action,
      };
    }
    pending.current = true;
    setBusy(true);
    setError('');
    setNotice('');
    let sent = false;
    try {
      storeCourierPointer(sessionStorage, pointer.current!);
      sent = true;
      await sendCourierCommand(api, attempt.current);
      await settled(text.saved);
      return true;
    } catch (failure) {
      const status = axios.isAxiosError(failure) ? failure.response?.status : undefined;
      uncertain.current = uncertain.current || !sent || !status || status >= 500;
      if (!uncertain.current) {
        try {
          clear();
        } catch {
          uncertain.current = true;
        }
        if (mounted.current) setStale(true);
      }
      if (mounted.current) {
        if (status === 401 || status === 403) input.onInvalidated();
        setRecovering(uncertain.current);
        setError(errorMessage(failure));
      }
      return false;
    } finally {
      pending.current = false;
      if (mounted.current) setBusy(false);
    }
  }
  async function resolve() {
    if (!enabled || !ready || pending.current || !pointer.current) return;
    pending.current = true;
    setBusy(true);
    setError('');
    try {
      const result = await resolveCourierCommand(api, courierRecovery(pointer.current));
      await settled(result.status === 'SUCCEEDED' ? text.saved : text.retired);
    } catch (failure) {
      if (mounted.current) {
        const status = axios.isAxiosError(failure) ? failure.response?.status : undefined;
        if (status === 401 || status === 403) input.onInvalidated();
        setError(errorMessage(failure));
      }
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
    locked: !ready || busy || recovering || stale || !enabled,
    refreshed: () => {
      if (!pending.current && !pointer.current) {
        setStale(false);
        setError('');
      }
    },
  };
}
