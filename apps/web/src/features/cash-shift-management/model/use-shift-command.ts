import axios from 'axios';
import { useEffect, useRef, useState } from 'react';
import { errorMessage } from '@pos/ui/api';
import { cashRecoveryMessages as text } from '@pos/ui/locales';
import { shiftAttemptIdentity, sendShiftAttempt } from '../lib/shift-attempt';
import type { ShiftAttempt, ShiftCommandInput } from './shift-management.types';
export function useShiftCommand({
  api,
  recovery,
  enabled,
  canSend,
  onSaved,
  isExternallyBlocked,
}: ShiftCommandInput) {
  const attempt = useRef<ShiftAttempt | null>(null),
    pending = useRef(false),
    mounted = useRef(false),
    unknown = useRef(false);
  const [busy, setBusy] = useState(false),
    [stale, setStale] = useState(false),
    [error, setError] = useState('');
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  useEffect(() => {
    attempt.current = null;
    unknown.current = false;
    setStale(false);
    setError('');
  }, [recovery.generation]);
  async function send(value?: ShiftAttempt) {
    if (
      !enabled ||
      pending.current ||
      stale ||
      (!attempt.current && recovery.blocked) ||
      isExternallyBlocked?.()
    )
      return;
    const kind = attempt.current?.kind ?? value?.kind;
    if (!kind || !canSend(kind)) return;
    attempt.current ??= value ? structuredClone(value) : null;
    if (!attempt.current) return;
    const original = attempt.current;
    const command = shiftAttemptIdentity(original);
    pending.current = true;
    setBusy(true);
    setError('');
    try {
      recovery.reserve(command);
      const shiftId = await sendShiftAttempt(api, original);
      recovery.clear(command, text.saved);
      attempt.current = null;
      unknown.current = false;
      if (mounted.current) {
        try {
          await onSaved(shiftId);
        } catch (failure) {
          if (mounted.current) setError(errorMessage(failure));
        }
      }
    } catch (failure) {
      if (!mounted.current) return;
      const status = axios.isAxiosError(failure) ? failure.response?.status : undefined;
      unknown.current = unknown.current || !status || status >= 500;
      if (!unknown.current) {
        try {
          recovery.clear(command, '', false);
          attempt.current = null;
          setStale(true);
        } catch {
          unknown.current = true;
        }
      }
      if (unknown.current) recovery.unknown();
      setError(errorMessage(failure));
    } finally {
      pending.current = false;
      recovery.finish();
      if (mounted.current) setBusy(false);
    }
  }
  return {
    send,
    busy,
    stale,
    error,
    recovery,
    hasAttempt: !!attempt.current,
    canRetry: !!attempt.current && canSend(attempt.current.kind),
    locked: !enabled || busy || stale || recovery.blocked,
    reset: () => {
      if (!recovery.blocked && !pending.current) {
        setStale(false);
        setError('');
        attempt.current = null;
      }
    },
  };
}
