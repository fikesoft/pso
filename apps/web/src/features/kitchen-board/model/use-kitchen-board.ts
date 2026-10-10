import { useCallback, useEffect, useRef, useState } from 'react';
import type { KitchenTicket } from '@pos/contracts';
import { errorMessage } from '@pos/ui/api';
import { operationalMessages as text } from '@pos/ui/locales';
import {
  useRemoteData,
  versionedMutationFailure,
  useInvalidation,
  useCoalescedInvalidation,
  isAccessRejection,
} from '../../../shared/lib';
import { readKitchen, updateKitchen } from '../../../entities/kitchen';
import { readKitchenWindow } from '../lib/kitchen-window';
import type {
  KitchenBoardData,
  KitchenBoardProps,
  KitchenColumnStatus,
  PendingKitchenUpdate,
} from './kitchen-board.types';
export function useKitchenBoard({ api, locationId }: KitchenBoardProps) {
  const [stationId, setStationId] = useState<string>();
  const depth = useRef({
    api,
    locationId,
    stationId,
    pages: { QUEUED: 1, PREPARING: 1, PARTIALLY_READY: 1, READY: 1 },
  });
  if (
    depth.current.api !== api ||
    depth.current.locationId !== locationId ||
    depth.current.stationId !== stationId
  ) {
    depth.current = {
      api,
      locationId,
      stationId,
      pages: { QUEUED: 1, PREPARING: 1, PARTIALLY_READY: 1, READY: 1 },
    };
  }
  const load = useCallback(async (): Promise<KitchenBoardData> => {
    const read = (status: KitchenColumnStatus) =>
      readKitchenWindow(
        (cursor) => readKitchen(api, locationId, status, cursor, stationId),
        depth.current.pages[status],
      );
    const [QUEUED, PREPARING, PARTIALLY_READY, READY] = await Promise.all([
      read('QUEUED'),
      read('PREPARING'),
      read('PARTIALLY_READY'),
      read('READY'),
    ]);
    return { QUEUED, PREPARING, PARTIALLY_READY, READY };
  }, [api, locationId, stationId]);
  const board = useRemoteData(load);
  const signal = useInvalidation(`kitchen:${locationId}`);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const pending = useRef(false);
  const liveDirty = useRef(false);
  const [liveReplay, setLiveReplay] = useState(0);
  useEffect(() => {
    const resume = () => {
      if (document.visibilityState === 'visible') setLiveReplay((value) => value + 1);
    };
    document.addEventListener('visibilitychange', resume);
    return () => document.removeEventListener('visibilitychange', resume);
  }, []);
  useCoalescedInvalidation(signal + liveReplay, async () => {
    if (pending.current) {
      liveDirty.current = true;
      return;
    }
    await board.revalidate(load, isAccessRejection);
  });
  function release() {
    pending.current = false;
    setBusy(false);
    if (liveDirty.current) {
      liveDirty.current = false;
      setLiveReplay((value) => value + 1);
    }
  }
  const attempt = useRef<PendingKitchenUpdate | null>(null);
  const [uncertain, setUncertain] = useState(false);
  const [stale, setStale] = useState(false);
  async function update(
    ticket: KitchenTicket,
    status: 'PREPARING' | 'PARTIALLY_READY' | 'READY',
    batchId?: string,
  ) {
    if (pending.current || stale) return;
    if (
      attempt.current &&
      (attempt.current.ticket.id !== ticket.id ||
        attempt.current.status !== status ||
        attempt.current.batchId !== batchId)
    )
      return;
    attempt.current ??= { ticket: structuredClone(ticket), status, batchId };
    pending.current = true;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await updateKitchen(
        api,
        attempt.current.ticket,
        attempt.current.status,
        attempt.current.batchId,
      );
      attempt.current = null;
      setUncertain(false);
      setNotice(text.kitchenUpdated);
      await board.revalidate(load, isAccessRejection);
    } catch (error) {
      const failure = versionedMutationFailure(error, uncertain);
      setUncertain(failure.uncertain);
      setStale(failure.stale);
      if (!failure.uncertain) attempt.current = null;
      setError(errorMessage(error));
    } finally {
      release();
    }
  }
  async function retry() {
    if (attempt.current)
      await update(attempt.current.ticket, attempt.current.status, attempt.current.batchId);
  }
  async function refresh() {
    if (pending.current || attempt.current) return false;
    pending.current = true;
    setBusy(true);
    try {
      const current = await board.refresh();
      if (current) {
        setStale(false);
        setError('');
      }
      return !!current;
    } finally {
      release();
    }
  }
  async function more(status: KitchenColumnStatus) {
    const cursor = board.data?.[status].nextCursor;
    if (!cursor || pending.current) return;
    pending.current = true;
    setBusy(true);
    try {
      depth.current.pages[status]++;
      await board.revalidate(load, isAccessRejection);
    } catch (error) {
      setError(errorMessage(error));
    } finally {
      release();
    }
  }
  function selectStation(next?: string) {
    if (pending.current || attempt.current) return;
    board.setData(null);
    setError('');
    setNotice('');
    setStale(false);
    setStationId(next);
  }
  return {
    board,
    busy,
    error,
    notice,
    update,
    more,
    retry,
    refresh,
    uncertain,
    stale,
    stationId,
    selectStation,
  };
}
