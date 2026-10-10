import { useCallback, useEffect, useRef, useState } from 'react';
import type { CashShiftListResponse } from '@pos/contracts';
import { errorMessage } from '@pos/ui/api';
import { readCashShifts } from '../../../entities/cash-shift';
import { isAccessRejection } from '../../../shared/lib';
import type { ResponsibilityProps, ResponsibilityView } from './responsibility-management.types';
export function useResponsibilityShifts(
  props: ResponsibilityProps,
  view: ResponsibilityView,
  manager: boolean,
) {
  const [data, setData] = useState<CashShiftListResponse | null>(null),
    [id, setId] = useState('');
  const [loading, setLoading] = useState(false),
    [error, setError] = useState(''),
    [dataKey, setDataKey] = useState('');
  const allowed =
    props.can('orders.read') &&
    props.can('cash.registers.read') &&
    props.can('cash.shifts.read') &&
    (!manager || (props.can('orders.handoff-others') && props.can('cash.reports.read')));
  const status = view === 'OUTGOING' ? 'ALL' : 'OPEN';
  const key = JSON.stringify([
    props.organizationId,
    props.actorUserId,
    props.locationId,
    allowed,
    manager,
    status,
  ]);
  const current = useRef(key);
  current.current = key;
  const epoch = useRef(0);
  const load = useCallback(
    async (cursor?: string) => {
      const revision = ++epoch.current;
      setError('');
      if (!cursor) setData(null);
      if (!allowed) {
        setLoading(false);
        return;
      }
      setLoading(true);
      try {
        const result = await readCashShifts(props.api, {
          locationId: props.locationId,
          view: manager ? 'ALL' : 'MINE',
          status,
          limit: 50,
          ...(cursor ? { cursor } : {}),
        });
        if (revision !== epoch.current || current.current !== key) return;
        setData((previous) => ({
          ...result,
          shifts:
            cursor && previous
              ? [
                  ...previous.shifts.filter(
                    (old) => !result.shifts.some((row) => row.id === old.id),
                  ),
                  ...result.shifts,
                ]
              : result.shifts,
        }));
        setDataKey(key);
      } catch (failure) {
        if (revision === epoch.current && current.current === key) {
          if (isAccessRejection(failure)) setData(null);
          setError(errorMessage(failure));
        }
      } finally {
        if (revision === epoch.current && current.current === key) setLoading(false);
      }
    },
    [props.api, props.locationId, allowed, manager, status, key],
  );
  useEffect(() => {
    setId('');
    void load();
    return () => {
      epoch.current++;
    };
  }, [load]);
  const visible = allowed && dataKey === key ? data : null;
  return {
    data: visible,
    id,
    setId,
    selected: visible?.shifts.find((row) => row.id === id) ?? null,
    loading,
    error,
    refresh: () => load(),
    more: () => (!loading && visible?.nextCursor ? load(visible.nextCursor) : Promise.resolve()),
  };
}
