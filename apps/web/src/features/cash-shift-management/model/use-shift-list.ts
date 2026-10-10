import { useCallback, useEffect, useRef, useState } from 'react';
import type { CashShiftListResponse } from '@pos/contracts';
import { errorMessage } from '@pos/ui/api';
import { readCashShifts } from '../../../entities/cash-shift';
import type { CashShiftManagementProps } from './shift-management.types';
export function useShiftList({ api, locationId, actorUserId, can }: CashShiftManagementProps) {
  const [status, setStatus] = useState<'OPEN' | 'CLOSED' | 'ALL'>('OPEN');
  const [view, setView] = useState<'MINE' | 'ALL'>('MINE');
  const [data, setData] = useState<CashShiftListResponse | null>(null);
  const [error, setError] = useState('');
  const [dataKey, setDataKey] = useState('');
  const [loading, setLoading] = useState(false);
  const revision = useRef(0);
  const allowed = can('cash.registers.read') && can('cash.shifts.read');
  const actualView = can('cash.reports.read') ? view : 'MINE';
  const queryKey = `${locationId}:${actorUserId}:${actualView}:${status}:${allowed}`;
  const load = useCallback(
    async (cursor?: string) => {
      const version = ++revision.current;
      if (!allowed) {
        setData(null);
        setLoading(false);
        return;
      }
      setLoading(true);
      setError('');
      if (!cursor) setData(null);
      try {
        const result = await readCashShifts(api, {
          locationId,
          view: actualView,
          status,
          limit: 50,
          ...(cursor ? { cursor } : {}),
        });
        if (version !== revision.current) return;
        setDataKey(queryKey);
        setData((old) => ({
          ...result,
          shifts:
            cursor && old
              ? [
                  ...old.shifts.filter(
                    (shift) => !result.shifts.some((next) => next.id === shift.id),
                  ),
                  ...result.shifts,
                ]
              : result.shifts,
        }));
      } catch (failure) {
        if (version === revision.current) {
          setData(null);
          setError(errorMessage(failure));
        }
      } finally {
        if (version === revision.current) setLoading(false);
      }
    },
    [api, locationId, actualView, status, allowed, queryKey],
  );
  useEffect(() => {
    void load();
    return () => {
      revision.current++;
    };
  }, [load]);
  return {
    data: allowed && dataKey === queryKey ? data : null,
    error,
    loading,
    status,
    setStatus,
    view: actualView,
    setView,
    refresh: () => load(),
    more: () =>
      dataKey === queryKey && data?.nextCursor && !loading
        ? load(data.nextCursor)
        : Promise.resolve(),
  };
}
