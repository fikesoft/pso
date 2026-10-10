import { useEffect, useRef, useState } from 'react';
import type { CashCommandIdentity } from '@pos/contracts';
import { errorMessage } from '@pos/ui/api';
import { cashRecoveryMessages as text } from '@pos/ui/locales';
import { resolveCashCommand } from '../api/cash-command.api';
import {
  clearCashPointer,
  isCashDrawerCommand,
  readCashPointer,
  sameCashCommand,
  storeCashPointer,
} from '../lib/cash-pointer';
import type { CashCommandPointer, CashRecoveryInput } from './cash-command.types';
export function useCashCommandRecovery(input: CashRecoveryInput) {
  const { organizationId, actorUserId, locationId, channel, api } = input;
  const scopeKey = `${organizationId}:${actorUserId}:${locationId}:${channel}`;
  const activeScope = useRef(scopeKey);
  activeScope.current = scopeKey;
  const epoch = useRef(0);
  const [pointer, setPointer] = useState<CashCommandPointer | null>(null);
  const current = useRef<CashCommandPointer | null>(null);
  const latest = useRef(input);
  latest.current = input;
  const [ready, setReady] = useState(false);
  const [uncertain, setUncertain] = useState(false);
  const [busy, setBusy] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [generation, setGeneration] = useState(0);
  const pending = useRef(false),
    mounted = useRef(false);
  useEffect(() => {
    mounted.current = true;
    epoch.current++;
    pending.current = false;
    setReady(false);
    setBusy(false);
    setSending(false);
    setError('');
    setNotice('');
    try {
      current.current = readCashPointer(
        sessionStorage,
        { organizationId, actorUserId, locationId },
        channel,
      );
      setPointer(current.current);
      setUncertain(!!current.current);
      setReady(true);
    } catch {
      setError(text.storage);
    }
    return () => {
      mounted.current = false;
      epoch.current++;
    };
  }, [organizationId, actorUserId, locationId, channel]);
  function reserve(command: CashCommandIdentity) {
    if (
      activeScope.current !== scopeKey ||
      !ready ||
      command.locationId !== locationId ||
      (channel === 'CASH') !== isCashDrawerCommand(command)
    )
      throw new Error(text.storage);
    if (current.current && !sameCashCommand(current.current.command, command))
      throw new Error(text.conflict);
    const value = { organizationId, actorUserId, locationId, command };
    try {
      storeCashPointer(sessionStorage, value, channel);
    } catch (failure) {
      setReady(false);
      setError(text.storage);
      throw failure;
    }
    setSending(true);
    current.current = value;
    setPointer(value);
    setNotice('');
  }
  function clear(command: CashCommandIdentity, message = '', resolved = true) {
    if (activeScope.current !== scopeKey) return;
    if (!current.current || !sameCashCommand(current.current.command, command))
      throw new Error(text.invalid);
    clearCashPointer(sessionStorage, current.current, channel);
    current.current = null;
    if (mounted.current && activeScope.current === scopeKey) {
      setPointer(null);
      setSending(false);
      setUncertain(false);
      setError('');
      setNotice(message);
      if (resolved) setGeneration((value) => value + 1);
    }
  }
  function unknown(message?: string) {
    if (mounted.current && activeScope.current === scopeKey) {
      setUncertain(true);
      if (message) setError(message);
    }
  }
  async function resolve() {
    const value = current.current;
    if (
      !value ||
      value.organizationId !== organizationId ||
      value.actorUserId !== actorUserId ||
      value.locationId !== locationId ||
      pending.current ||
      sending ||
      !latest.current.canResolve(value.command)
    )
      return;
    const requestEpoch = epoch.current;
    pending.current = true;
    setBusy(true);
    setError('');
    try {
      const result = await resolveCashCommand(api, value.command);
      if (!mounted.current || epoch.current !== requestEpoch || activeScope.current !== scopeKey)
        return;
      if (
        (result.status !== 'SUCCEEDED' && result.status !== 'RETIRED') ||
        !sameCashCommand(result.command, value.command)
      )
        throw new Error(text.invalid);
      clear(value.command, result.status === 'SUCCEEDED' ? text.saved : text.retired);
      if (mounted.current && activeScope.current === scopeKey) {
        try {
          await latest.current.onResolved?.(value.command);
        } catch (failure) {
          if (mounted.current && epoch.current === requestEpoch) setError(errorMessage(failure));
        }
      }
    } catch (failure) {
      if (mounted.current && epoch.current === requestEpoch) setError(errorMessage(failure));
    } finally {
      if (epoch.current === requestEpoch) {
        pending.current = false;
        if (mounted.current) setBusy(false);
      }
    }
  }
  return {
    pointer,
    ready,
    uncertain,
    busy: busy || sending,
    error,
    notice,
    generation,
    reserve,
    clear,
    unknown,
    resolve,
    finish: () => {
      if (mounted.current && activeScope.current === scopeKey) setSending(false);
    },
    blocked: !ready || !!pointer,
    canResolve: !!pointer && input.canResolve(pointer.command),
  };
}
