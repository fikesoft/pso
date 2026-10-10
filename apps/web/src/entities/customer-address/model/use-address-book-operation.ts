import axios from 'axios';
import { useEffect, useRef, useState } from 'react';
import { errorMessage } from '@pos/ui/api';
import { cashRecoveryMessages as text } from '@pos/ui/locales';
import { sendAddressBook, resolveAddressBook } from '../api/address-management.api';
import {
  clearAddressBookPointer,
  readAddressBookPointer,
  storeAddressBookPointer,
  addressBookIdentity,
} from '../lib/address-book-pointer';
import type {
  AddressBookOperationInput,
  AddressBookPointer,
  AddressBookAttempt,
} from './address-management.types';

export function useAddressBookOperation(input: AddressBookOperationInput) {
  const { organizationId, actorUserId, locationId, customerId } = input;
  const scopeKey = `${organizationId}:${actorUserId}:${locationId}:${customerId}`;
  const activeScope = useRef(scopeKey);
  activeScope.current = scopeKey;
  const epoch = useRef(0);
  const loadedScope = useRef<string | null>(null);
  const latest = useRef(input);
  latest.current = input;
  const pointer = useRef<AddressBookPointer | null>(null);
  const attempt = useRef<AddressBookAttempt | null>(null);
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
      pointer.current = readAddressBookPointer(sessionStorage, {
        organizationId,
        actorUserId,
        locationId,
        customerId,
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
  }, [organizationId, actorUserId, locationId, customerId]);
  const current = (generation: number) =>
    generation === epoch.current && activeScope.current === scopeKey;
  function allowed() {
    return latest.current.canManage;
  }
  function clear() {
    if (pointer.current) clearAddressBookPointer(sessionStorage, pointer.current);
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
  async function send(value?: AddressBookAttempt) {
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
      if (value.locationId !== locationId) return false;
      const command = addressBookIdentity({
        action: value.action,
        locationId,
        requestKey: value.requestKey,
        ...(value.action === 'CREATE' ? {} : { addressId: value.addressId }),
      } as AddressBookPointer['command']);
      if (!allowed()) return false;
      attempt.current = structuredClone(value);
      pointer.current = { organizationId, actorUserId, locationId, customerId, command };
    }
    if (!pointer.current || !allowed()) return false;
    const generation = epoch.current;
    const saved = attempt.current;
    pending.current = true;
    setBusy(true);
    setError('');
    setNotice('');
    let sent = false;
    try {
      storeAddressBookPointer(sessionStorage, pointer.current);
      sent = true;
      const result = await sendAddressBook(latest.current.api, pointer.current, saved);
      if (!current(generation)) return false;
      await settled(generation, result === 'SUCCEEDED' ? text.saved : text.retired);
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
      !allowed() ||
      activeScope.current !== scopeKey
    )
      return;
    const generation = epoch.current;
    pending.current = true;
    setBusy(true);
    setError('');
    try {
      const result = await resolveAddressBook(latest.current.api, value);
      if (!current(generation)) return;
      await settled(generation, result === 'SUCCEEDED' ? text.saved : text.retired);
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
    canResolve: !!pointer.current && allowed(),
    refreshed: () => {
      setStale(false);
      setError('');
    },
  };
}
