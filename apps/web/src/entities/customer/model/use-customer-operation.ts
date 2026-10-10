import axios from 'axios';
import { useEffect, useRef, useState } from 'react';
import { errorMessage } from '@pos/ui/api';
import { cashRecoveryMessages as text } from '@pos/ui/locales';
import { customerManagementCommandSchema } from '@pos/contracts/customer-management';
import { sendCustomerCommand, resolveCustomerCommand } from '../api/customer-management.api';
import {
  clearCustomerPointer,
  readCustomerPointer,
  storeCustomerPointer,
  validateCustomerOutcome,
} from '../lib/customer-pointer';
import type {
  CustomerOperationInput,
  CustomerPointer,
  CustomerAttempt,
} from './customer-management.types';

export function useCustomerOperation(input: CustomerOperationInput) {
  const { organizationId, actorUserId, locationId } = input;
  const scopeKey = `${organizationId}:${actorUserId}:${locationId}`;
  const activeScope = useRef(scopeKey);
  activeScope.current = scopeKey;
  const epoch = useRef(0);
  const loadedScope = useRef<string | null>(null);
  const latest = useRef(input);
  latest.current = input;
  const pointer = useRef<CustomerPointer | null>(null);
  const attempt = useRef<CustomerAttempt | null>(null);
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
      pointer.current = readCustomerPointer(sessionStorage, {
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
  function allowed(command: CustomerPointer) {
    return command.command.action === 'UPDATE'
      ? latest.current.canUpdate
      : latest.current.canArchive;
  }
  function clear() {
    if (pointer.current) clearCustomerPointer(sessionStorage, pointer.current);
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
  async function send(value?: CustomerAttempt) {
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
      const { customerId, ...body } = value;
      const parsed = customerManagementCommandSchema.parse(body);
      if (parsed.locationId !== locationId) return false;
      const next = {
        organizationId,
        actorUserId,
        locationId,
        customerId,
        command: { locationId, action: parsed.action, requestKey: parsed.requestKey },
      };
      if (!allowed(next)) return false;
      attempt.current = { ...parsed, customerId };
      pointer.current = next;
    }
    if (!pointer.current || !allowed(pointer.current)) return false;
    const generation = epoch.current;
    const saved = attempt.current;
    pending.current = true;
    setBusy(true);
    setError('');
    setNotice('');
    let sent = false;
    try {
      storeCustomerPointer(sessionStorage, pointer.current);
      sent = true;
      const result = await sendCustomerCommand(latest.current.api, saved);
      if (!current(generation)) return false;
      validateCustomerOutcome(pointer.current, result, saved);
      await settled(generation, result.status === 'SUCCEEDED' ? text.saved : text.retired);
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
      !allowed(value) ||
      activeScope.current !== scopeKey
    )
      return;
    const generation = epoch.current;
    pending.current = true;
    setBusy(true);
    setError('');
    try {
      const result = await resolveCustomerCommand(latest.current.api, value);
      if (!current(generation)) return;
      validateCustomerOutcome(value, result);
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
    canResolve: !!pointer.current && allowed(pointer.current),
    refreshed: () => {
      setStale(false);
      setError('');
    },
  };
}
