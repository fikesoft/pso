import axios from 'axios';
import { useEffect, useRef, useState } from 'react';
import { errorMessage } from '@pos/ui/api';
import { cashRecoveryMessages as text } from '@pos/ui/locales';
import { validateStationResult } from '../lib/station-result';
import {
  resolveStationOperation,
  sendStationAttempt,
  stationAttemptIdentity,
} from '../lib/station-attempt';
import {
  clearStationPointer,
  readStationPointer,
  sameStationIdentity,
  storeStationPointer,
} from '../lib/station-pointer';
import type {
  StationAttempt,
  StationOperationIdentity,
  StationOperationInput,
  StationOperationResult,
  StationPointer,
} from './station-operation.types';

export function useStationOperation(input: StationOperationInput) {
  const { api, organizationId, actorUserId, locationId, family } = input;
  const scopeKey = `${organizationId}:${actorUserId}:${locationId}:${family}`;
  const activeScope = useRef(scopeKey);
  activeScope.current = scopeKey;
  const epoch = useRef(0);
  const loadedScope = useRef<string | null>(null);
  const latest = useRef(input);
  latest.current = input;
  const pointer = useRef<StationPointer | null>(null);
  const attempt = useRef<StationAttempt | null>(null);
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
    setError('');
    setNotice('');
    setRecovering(false);
    try {
      pointer.current = readStationPointer(
        sessionStorage,
        { organizationId, actorUserId, locationId },
        family,
      );
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
  }, [organizationId, actorUserId, locationId, family]);
  const current = (generation: number) =>
    generation === epoch.current && activeScope.current === scopeKey;
  function allowed(_identity: StationOperationIdentity) {
    return latest.current.can('kitchen.read') && latest.current.can('kitchen.stations.manage');
  }
  function clear() {
    if (pointer.current) clearStationPointer(sessionStorage, pointer.current);
    pointer.current = null;
    attempt.current = null;
    unknown.current = false;
    setRecovering(false);
  }
  async function settled(generation: number, message: string, result?: StationOperationResult) {
    if (!current(generation)) return;
    clear();
    setError('');
    setNotice(message);
    try {
      await latest.current.onSaved(result);
    } catch (failure) {
      if (current(generation)) setError(errorMessage(failure));
    }
  }
  async function send(value?: StationAttempt) {
    if (
      !ready ||
      loadedScope.current !== scopeKey ||
      pending.current ||
      stale ||
      activeScope.current !== scopeKey ||
      latest.current.isExternallyBlocked?.()
    )
      return false;
    if (!attempt.current) {
      if (
        !value ||
        pointer.current ||
        value.family !== family ||
        value.body.locationId !== locationId
      )
        return false;
      const identity = stationAttemptIdentity(value);
      if (!allowed(identity)) return false;
      attempt.current = structuredClone(value);
      pointer.current = { organizationId, actorUserId, locationId, ...identity };
    }
    if (!pointer.current || !allowed(pointer.current)) return false;
    const generation = epoch.current;
    const savedAttempt = attempt.current;
    pending.current = true;
    setBusy(true);
    setError('');
    setNotice('');
    let sent = false;
    try {
      storeStationPointer(sessionStorage, pointer.current);
      sent = true;
      const result = await sendStationAttempt(api, savedAttempt);
      if (!current(generation)) return false;
      validateStationResult(stationAttemptIdentity(savedAttempt), result);
      await settled(generation, text.saved, result);
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
      activeScope.current !== scopeKey ||
      latest.current.isExternallyBlocked?.()
    )
      return;
    const generation = epoch.current;
    pending.current = true;
    setBusy(true);
    setError('');
    try {
      const result = await resolveStationOperation(api, value);
      if (!current(generation)) return;
      if (
        (result.status !== 'SUCCEEDED' && result.status !== 'RETIRED') ||
        !sameStationIdentity(value, {
          family: value.family,
          command: result.command,
        } as StationOperationIdentity)
      )
        throw new Error(text.invalid);
      if (result.status === 'SUCCEEDED') {
        if (value.family === 'STATION' && 'station' in result.result)
          validateStationResult(value, { family: 'STATION', result: result.result });
        else if (value.family === 'ROUTING' && 'routing' in result.result)
          validateStationResult(value, { family: 'ROUTING', result: result.result });
        else throw new Error(text.invalid);
      }
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
