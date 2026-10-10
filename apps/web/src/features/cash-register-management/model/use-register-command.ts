import axios from 'axios';
import { useEffect, useRef, useState } from 'react';
import { errorMessage } from '@pos/ui/api';
import {
  sendCashRegisterCommand,
  resolveCashRegisterCommand,
} from '../../../entities/cash-register';
import type { CashRegisterAttempt } from '../../../entities/cash-register';
import { cashRegisterMessages as text } from '@pos/ui/locales';
import {
  clearRegisterPointer,
  readRegisterPointer,
  registerResolution,
  storeRegisterPointer,
} from '../lib/register-pointer';
import type { RegisterCommandInput, RegisterPointer } from './register-management.types';

export function useRegisterCommand(input: RegisterCommandInput) {
  const { api, organizationId, actorUserId, locationId, enabled } = input;
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [recovering, setRecovering] = useState(false);
  const [stale, setStale] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const pointer = useRef<RegisterPointer | null>(null);
  const attempt = useRef<CashRegisterAttempt | null>(null);
  const pending = useRef(false);
  const uncertain = useRef(false);
  const mounted = useRef(false);
  useEffect(() => {
    mounted.current = true;
    try {
      pointer.current = readRegisterPointer(sessionStorage, {
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
    if (pointer.current) clearRegisterPointer(sessionStorage, pointer.current);
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
    try {
      await input.onSettled();
    } catch (failure) {
      if (mounted.current) setError(errorMessage(failure));
    }
  }
  async function send(value?: CashRegisterAttempt) {
    if (!enabled || !ready || pending.current || stale || (pointer.current && !attempt.current))
      return false;
    if (!attempt.current) {
      if (!value || pointer.current) return false;
      attempt.current = structuredClone(value);
      pointer.current = {
        organizationId,
        actorUserId,
        ...registerResolution({
          organizationId,
          actorUserId,
          locationId,
          requestKey: value.body.requestKey,
          kind: value.kind,
          ...(value.kind === 'CREATE' ? {} : { registerId: value.registerId }),
        } as RegisterPointer),
      };
    }
    pending.current = true;
    setBusy(true);
    setError('');
    setNotice('');
    let sent = false;
    try {
      storeRegisterPointer(sessionStorage, pointer.current!);
      sent = true;
      const { register } = await sendCashRegisterCommand(api, attempt.current);
      if (
        register.locationId !== locationId ||
        (attempt.current.kind !== 'CREATE' && register.id !== attempt.current.registerId)
      )
        throw new Error(text.invalidResolution);
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
      const current = pointer.current;
      const result = await resolveCashRegisterCommand(api, registerResolution(current));
      if (
        result.kind !== current.kind ||
        (result.status === 'SUCCEEDED' &&
          (result.register.locationId !== locationId ||
            (current.kind !== 'CREATE' && result.register.id !== current.registerId))) ||
        (result.status === 'RETIRED' &&
          (result.locationId !== locationId ||
            result.requestKey !== current.requestKey ||
            result.registerId !== (current.kind === 'CREATE' ? null : current.registerId))) ||
        (result.status !== 'SUCCEEDED' && result.status !== 'RETIRED')
      )
        throw new Error(text.invalidResolution);
      await settled(result.status === 'SUCCEEDED' ? text.saved : text.retired);
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
    locked: !ready || busy || recovering || stale || !enabled,
    refreshed: () => {
      setStale(false);
      setError('');
    },
  };
}
