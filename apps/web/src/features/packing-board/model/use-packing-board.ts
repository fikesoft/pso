import { useCallback, useEffect, useRef, useState } from 'react';
import type { PackingBoardFilter, PackingListResponse } from '@pos/contracts';
import { packingMessages as text } from '@pos/ui/locales';
import { readPacking, usePackingOperation } from '../../../entities/packing';
import { isAccessRejection, useRemoteData } from '../../../shared/lib';
import { PACKING_REFRESH_MS } from '../config/packing.constants';
import type { PackingBoardProps } from './packing-board.types';

export function usePackingBoard(props: PackingBoardProps) {
  const [filter, setFilter] = useState<PackingBoardFilter>('ACTIVE');
  const depth = useRef(1);
  const load = useCallback(async () => {
    const result: PackingListResponse = { sessions: [], nextCursor: null };
    const seen = new Set<string>();
    for (let page = 0; page < depth.current; page++) {
      const next = await readPacking(
        props.api,
        props.locationId,
        filter,
        result.nextCursor ?? undefined,
      );
      for (const session of next.sessions)
        if (!seen.has(session.id)) {
          result.sessions.push(session);
          seen.add(session.id);
        }
      result.nextCursor = next.nextCursor;
      if (!next.nextCursor) break;
    }
    return result;
  }, [props.api, props.locationId, filter]);
  const board = useRemoteData(load);
  const operation = usePackingOperation({
    ...props,
    canUpdate: props.can('packing.update'),
    canComplete: props.can('packing.complete'),
    onSaved: async () => {
      board.setData(null);
      if (!(await board.refresh())) throw new Error(text.refreshRequired);
    },
  });
  const locked = operation.locked || board.loading || !!board.error;
  const refreshing = useRef(false);
  useEffect(() => {
    let disposed = false;
    const refresh = async () => {
      if (
        disposed ||
        refreshing.current ||
        operation.busy ||
        document.visibilityState !== 'visible'
      )
        return;
      refreshing.current = true;
      try {
        await board.revalidate(load, isAccessRejection);
      } finally {
        refreshing.current = false;
      }
    };
    const timer = window.setInterval(() => void refresh(), PACKING_REFRESH_MS);
    const resume = () => void refresh();
    document.addEventListener('visibilitychange', resume);
    return () => {
      disposed = true;
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', resume);
    };
  }, [load, board.revalidate, operation.busy]);
  async function refresh() {
    if (operation.busy || operation.recovering) return;
    board.setData(null);
    if (await board.refresh()) operation.refreshed();
  }
  async function more() {
    if (locked || !board.data?.nextCursor) return;
    depth.current++;
    await refresh();
  }
  function selectFilter(next: PackingBoardFilter) {
    if (operation.busy || operation.recovering) return;
    depth.current = 1;
    board.setData(null);
    setFilter(next);
  }
  return { board, operation, locked, filter, selectFilter, refresh, more };
}
