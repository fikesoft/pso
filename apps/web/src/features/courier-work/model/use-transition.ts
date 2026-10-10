import axios from 'axios';
import { useEffect, useRef, useState } from 'react';
import { errorMessage } from '@pos/ui/api';
import { courierWorkMessages as text } from '@pos/ui/locales';
import { sendTransition, resolveTransition } from '../../../entities/courier-work';
import type { TransitionAttempt } from '../../../entities/courier-work';
import {
  readTransitionPointer,
  storeTransitionPointer,
  clearTransitionPointer,
  transitionRecovery,
} from '../lib/transition-pointer';
import type { TransitionInput, TransitionPointer } from './courier-transition.types';
export function useTransition(input: TransitionInput) {
  const { organizationId, actorUserId, locationId, enabled, api } = input;
  const [ready, setReady] = useState(false),
    [busy, setBusy] = useState(false),
    [recovering, setRecovering] = useState(false),
    [stale, setStale] = useState(false);
  const [error, setError] = useState(''),
    [notice, setNotice] = useState('');
  const pointer = useRef<TransitionPointer | null>(null),
    attempt = useRef<TransitionAttempt | null>(null);
  const pending = useRef(false),
    uncertain = useRef(false),
    mounted = useRef(false);
  useEffect(() => {
    mounted.current = true;
    try {
      pointer.current = readTransitionPointer(sessionStorage, {
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
    if (pointer.current) clearTransitionPointer(sessionStorage, pointer.current);
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
  async function send(value?: TransitionAttempt) {
    if (!enabled || !ready || pending.current || stale || (pointer.current && !attempt.current))
      return false;
    if (!attempt.current) {
      if (!value || pointer.current) return false;
      attempt.current = structuredClone(value);
      pointer.current = {
        organizationId,
        actorUserId,
        locationId,
        orderId: value.orderId,
        requestKey: value.body.requestKey,
        status: value.body.status,
      };
    }
    pending.current = true;
    setBusy(true);
    setError('');
    setNotice('');
    let sent = false;
    try {
      storeTransitionPointer(sessionStorage, pointer.current!);
      sent = true;
      await sendTransition(api, actorUserId, attempt.current);
      await settled(text.transitionSaved);
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
      const result = await resolveTransition(api, actorUserId, transitionRecovery(pointer.current));
      await settled(result.status === 'SUCCEEDED' ? text.transitionSaved : text.transitionRetired);
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
