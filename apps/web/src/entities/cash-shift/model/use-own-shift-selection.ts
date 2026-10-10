import { useCallback, useEffect, useRef, useState } from 'react';
import type { CashShiftListResponse } from '@pos/contracts';
import { errorMessage } from '@pos/ui/api';
import { readCashShifts } from '../api/cash-shift.api';
import type { OwnShiftSelectionInput } from './cash-shift.types';
export function useOwnShiftSelection({
  api,
  locationId,
  actorUserId,
  enabled,
}: OwnShiftSelectionInput) {
  const [data, setData] = useState<CashShiftListResponse | null>(null);
  const [selectedId, setSelectedId] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const revision = useRef(0);
  const load = useCallback(
    async (cursor?: string) => {
      const current = ++revision.current;
      if (!enabled) {
        setData(null);
        setLoading(false);
        return;
      }
      setLoading(true);
      setError('');
      if (!cursor) setData(null);
      try {
        const page = await readCashShifts(api, {
          locationId,
          view: 'MINE',
          status: 'OPEN',
          limit: 50,
          ...(cursor ? { cursor } : {}),
        });
        if (revision.current !== current) return;
        const own = page.shifts.filter(
          (shift) =>
            shift.locationId === locationId &&
            shift.ownerUserId === actorUserId &&
            shift.status === 'OPEN',
        );
        setData((old) => ({
          ...page,
          shifts:
            cursor && old
              ? [...old.shifts.filter((shift) => !own.some((next) => next.id === shift.id)), ...own]
              : own,
        }));
      } catch (failure) {
        if (revision.current === current) {
          setData(null);
          setError(errorMessage(failure));
        }
      } finally {
        if (revision.current === current) setLoading(false);
      }
    },
    [api, locationId, actorUserId, enabled],
  );
  useEffect(() => {
    void load();
    return () => {
      revision.current++;
    };
  }, [load]);
  const selected =
    enabled && !error ? data?.shifts.find((shift) => shift.id === selectedId) : undefined;
  return {
    data: enabled ? data : null,
    selectedId,
    select: setSelectedId,
    selected,
    error,
    loading,
    enabled,
    refresh: () => load(),
    more: () => (data?.nextCursor && !loading ? load(data.nextCursor) : Promise.resolve()),
  };
}
