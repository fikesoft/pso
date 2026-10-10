import axios from 'axios';
import { useEffect, useRef, useState } from 'react';
import type { OrderResponsibilityCommandIdentity } from '@pos/contracts/order-responsibilities';
import { errorMessage } from '@pos/ui/api';
import { cashRecoveryMessages as text } from '@pos/ui/locales';
import {
  clearResponsibilityPointer,
  executeResponsibility,
  readResponsibilityPointer,
  resolveResponsibility,
  sameResponsibilityCommand,
  storeResponsibilityPointer,
} from '../../../entities/order-responsibility';
import type { ResponsibilityPointer } from '../../../entities/order-responsibility';
import { responsibilityAttemptIdentity } from '../lib/responsibility-attempt';
import type {
  ResponsibilityAttempt,
  ResponsibilityCommandInput,
} from './responsibility-management.types';
export function useResponsibilityCommand(input: ResponsibilityCommandInput) {
  const latest = useRef(input);
  latest.current = input;
  const scopeKey = `${input.organizationId}:${input.actorUserId}:${input.locationId}`;
  const initializedScope = useRef('');
  const scope = useRef(scopeKey);
  scope.current = scopeKey;
  const epoch = useRef(0),
    pending = useRef(false),
    unknown = useRef(false);
  const current = useRef<ResponsibilityPointer | null>(null),
    attempt = useRef<ResponsibilityAttempt | null>(null);
  const [pointer, setPointer] = useState<ResponsibilityPointer | null>(null);
  const [ready, setReady] = useState(false),
    [busy, setBusy] = useState(false),
    [uncertain, setUncertain] = useState(false);
  const [stale, setStale] = useState(false),
    [error, setError] = useState(''),
    [notice, setNotice] = useState('');
  const [generation, setGeneration] = useState(0);
  useEffect(() => {
    epoch.current++;
    initializedScope.current = scopeKey;
    pending.current = false;
    attempt.current = null;
    current.current = null;
    unknown.current = false;
    setReady(false);
    setBusy(false);
    setStale(false);
    setError('');
    setNotice('');
    setPointer(null);
    try {
      current.current = readResponsibilityPointer(sessionStorage, input);
      unknown.current = !!current.current;
      setPointer(current.current);
      setUncertain(unknown.current);
      setReady(true);
    } catch {
      setError(text.storage);
    }
    return () => {
      epoch.current++;
    };
  }, [scopeKey]);
  function canResolve(command: OrderResponsibilityCommandIdentity) {
    const can = latest.current.can;
    return (
      can('orders.read') &&
      can('cash.registers.read') &&
      can('cash.shifts.read') &&
      (command.kind === 'PREPARE_HANDOFF'
        ? can('orders.handoff') || (can('orders.handoff-others') && can('cash.reports.read'))
        : can('orders.handoff'))
    );
  }
  function clear(message: string, terminal = true) {
    if (!current.current) throw new Error(text.invalid);
    clearResponsibilityPointer(sessionStorage, current.current);
    current.current = null;
    attempt.current = null;
    unknown.current = false;
    setPointer(null);
    setUncertain(false);
    setNotice(message);
    if (terminal) {
      setGeneration((value) => value + 1);
      setStale(false);
      setError('');
    }
  }
  async function refreshed(revision: number) {
    try {
      await latest.current.onSaved();
    } catch (failure) {
      if (revision === epoch.current && scope.current === scopeKey) setError(errorMessage(failure));
    }
  }
  async function send(value?: ResponsibilityAttempt) {
    if (
      initializedScope.current !== scopeKey ||
      !ready ||
      pending.current ||
      stale ||
      latest.current.isReviewLocked() ||
      (!attempt.current && current.current)
    )
      return;
    const original = attempt.current ?? (value ? structuredClone(value) : null);
    if (!original) return;
    const command = responsibilityAttemptIdentity(original);
    if (!canResolve(command) || command.locationId !== input.locationId) return;
    const revision = epoch.current;
    attempt.current = original;
    pending.current = true;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const candidate = {
        organizationId: input.organizationId,
        actorUserId: input.actorUserId,
        locationId: input.locationId,
        command,
      };
      storeResponsibilityPointer(sessionStorage, candidate);
      current.current = candidate;
      setPointer(candidate);
      await executeResponsibility(input.api, original.orderId, original.body);
      if (revision !== epoch.current || scope.current !== scopeKey) return;
      clear(text.saved);
      await refreshed(revision);
    } catch (failure) {
      if (revision !== epoch.current || scope.current !== scopeKey) return;
      if (!current.current) {
        setReady(false);
        setError(text.storage);
        return;
      }
      const status = axios.isAxiosError(failure) ? failure.response?.status : undefined;
      unknown.current = unknown.current || !status || status >= 500;
      if (!unknown.current) {
        try {
          clear('', false);
          setStale(true);
        } catch {
          unknown.current = true;
        }
      }
      setUncertain(unknown.current);
      setError(errorMessage(failure));
    } finally {
      if (revision === epoch.current) {
        pending.current = false;
        setBusy(false);
      }
    }
  }
  async function resolve() {
    const value = current.current;
    if (
      !value ||
      initializedScope.current !== scopeKey ||
      value.organizationId !== input.organizationId ||
      value.actorUserId !== input.actorUserId ||
      value.locationId !== input.locationId ||
      pending.current ||
      !canResolve(value.command)
    )
      return;
    const revision = epoch.current;
    pending.current = true;
    setBusy(true);
    setError('');
    try {
      const result = await resolveResponsibility(input.api, value.command);
      if (revision !== epoch.current || scope.current !== scopeKey) return;
      if (
        (result.status !== 'SUCCEEDED' && result.status !== 'RETIRED') ||
        !sameResponsibilityCommand(result.command, value.command)
      )
        throw new Error(text.invalid);
      clear(result.status === 'SUCCEEDED' ? text.saved : text.retired);
      await refreshed(revision);
    } catch (failure) {
      if (revision === epoch.current && scope.current === scopeKey) setError(errorMessage(failure));
    } finally {
      if (revision === epoch.current) {
        pending.current = false;
        setBusy(false);
      }
    }
  }
  return {
    pointer,
    ready,
    busy,
    uncertain,
    stale,
    error,
    notice,
    generation,
    send,
    resolve,
    canResolve: !!pointer && canResolve(pointer.command),
    hasAttempt: !!attempt.current,
    canRetry: !!attempt.current && canResolve(responsibilityAttemptIdentity(attempt.current)),
    blocked: !ready || !!pointer,
    isBlocking: () => !ready || pending.current || !!current.current,
    reset: () => {
      if (!current.current && !pending.current) {
        attempt.current = null;
        setError('');
        setStale(false);
      }
    },
  };
}
