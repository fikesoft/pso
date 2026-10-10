import axios from 'axios';
import { useEffect, useRef, useState } from 'react';
import { errorMessage } from '@pos/ui/api';
import { cashRecoveryMessages as text } from '@pos/ui/locales';
import type { ResolvePackingCommandInput } from '@pos/contracts';
import { resolvePackingCommandSchema } from '@pos/contracts/packing';
import { sendPacking, resolvePacking } from '../api/packing.api';
import {
  clearPackingPointer,
  readPackingPointer,
  storePackingPointer,
  samePackingCommand,
  validatePackingResult,
} from '../lib/packing-pointer';
import type { PackingOperationInput, PackingPointer, PackingAttempt } from './packing.types';

export function usePackingOperation(input: PackingOperationInput) {
  const { organizationId, actorUserId, locationId } = input;
  const scopeKey = `${organizationId}:${actorUserId}:${locationId}`;
  const activeScope = useRef(scopeKey);
  activeScope.current = scopeKey;
  const epoch = useRef(0);
  const loadedScope = useRef<string | null>(null);
  const latest = useRef(input);
  latest.current = input;
  const pointer = useRef<PackingPointer | null>(null);
  const attempt = useRef<PackingAttempt | null>(null);
  const pending = useRef(false);
  const unknown = useRef(false);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [recovering, setRecovering] = useState(false);
  const [stale, setStale] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  useEffect(() => {
    epoch.current++;
    loadedScope.current = null;
    pending.current = false;
    attempt.current = null;
    pointer.current = null;
    unknown.current = false;
    setReady(false);
    setBusy(false);
    setStale(false);
    setRecovering(false);
    setError('');
    setNotice('');
    try {
      pointer.current = readPackingPointer(sessionStorage, {
        organizationId,
        actorUserId,
        locationId,
      });
      unknown.current = !!pointer.current;
      setRecovering(unknown.current);
      setReady(true);
      loadedScope.current = scopeKey;
    } catch {
      setError(text.storage);
    }
    return () => {
      epoch.current++;
    };
  }, [organizationId, actorUserId, locationId]);
  const current = (generation: number) =>
    generation === epoch.current && activeScope.current === scopeKey;
  function allowed(command: ResolvePackingCommandInput) {
    return command.action === 'COMPLETE' ? latest.current.canComplete : latest.current.canUpdate;
  }
  function clear() {
    if (pointer.current) clearPackingPointer(sessionStorage, pointer.current);
    pointer.current = null;
    attempt.current = null;
    unknown.current = false;
    setRecovering(false);
  }
  async function settled(generation: number, message: string) {
    if (!current(generation)) return;
    clear();
    setError('');
    setNotice(message);
    setStale(true);
    try {
      await latest.current.onSaved();
      if (current(generation)) setStale(false);
    } catch (failure) {
      if (current(generation)) setError(errorMessage(failure));
    }
  }
  async function send(value?: PackingAttempt) {
    if (
      !ready ||
      loadedScope.current !== scopeKey ||
      pending.current ||
      stale ||
      activeScope.current !== scopeKey
    )
      return false;
    if (!attempt.current) {
      if (!value || pointer.current) return false;
      const command = resolvePackingCommandSchema.parse({
        sessionId: value.sessionId,
        action: value.action,
        requestKey: value.requestKey,
      });
      if (!allowed(command)) return false;
      attempt.current = structuredClone(value);
      pointer.current = { organizationId, actorUserId, locationId, command };
    }
    if (!pointer.current || !allowed(pointer.current.command)) return false;
    const generation = epoch.current;
    const saved = attempt.current;
    pending.current = true;
    setBusy(true);
    setError('');
    setNotice('');
    let sent = false;
    try {
      storePackingPointer(sessionStorage, pointer.current);
      sent = true;
      const result = await sendPacking(latest.current.api, saved);
      if (!current(generation)) return false;
      validatePackingResult(pointer.current.command, result.result, saved);
      await settled(generation, text.saved);
      return true;
    } catch (failure) {
      if (!current(generation)) return false;
      const status = axios.isAxiosError(failure) ? failure.response?.status : undefined;
      unknown.current ||= !sent || !status || status >= 500;
      if (!unknown.current) {
        try {
          clear();
        } catch {
          unknown.current = true;
        }
        setStale(true);
      }
      setRecovering(unknown.current);
      setError(errorMessage(failure));
      return false;
    } finally {
      if (current(generation)) {
        pending.current = false;
        setBusy(false);
      }
    }
  }
  async function resolve() {
    const value = pointer.current;
    if (
      !ready ||
      loadedScope.current !== scopeKey ||
      pending.current ||
      !value ||
      !allowed(value.command) ||
      activeScope.current !== scopeKey
    )
      return;
    const generation = epoch.current;
    pending.current = true;
    setBusy(true);
    setError('');
    try {
      const result = await resolvePacking(latest.current.api, value.command);
      if (!current(generation)) return;
      if (
        (result.status !== 'SUCCEEDED' && result.status !== 'RETIRED') ||
        !samePackingCommand(value.command, result.command)
      )
        throw new Error(text.invalid);
      if (result.status === 'SUCCEEDED') validatePackingResult(value.command, result.result);
      await settled(generation, result.status === 'SUCCEEDED' ? text.saved : text.retired);
    } catch (failure) {
      if (current(generation)) setError(errorMessage(failure));
    } finally {
      if (current(generation)) {
        pending.current = false;
        setBusy(false);
      }
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
    locked: !ready || busy || recovering || stale,
    canResolve: !!pointer.current && allowed(pointer.current.command),
    refreshed: () => {
      setStale(false);
      setError('');
    },
  };
}
