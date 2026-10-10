import { useCallback, useEffect, useRef, useState } from 'react';
import type { CashMovementListResponse } from '@pos/contracts/cash-movements';
import { errorMessage } from '@pos/ui/api';
import { readCashMovements } from '../../../entities/cash-shift';
import { isAccessRejection } from '../../../shared/lib';
import type { ShiftMovementsProps } from './shift-management.types';
export function useShiftMovements({ props, detail }: ShiftMovementsProps) {
  const [expanded, setExpanded] = useState(false);
  const [data, setData] = useState<CashMovementListResponse | null>(null);
  const [dataKey, setDataKey] = useState('');
  const [loading, setLoading] = useState(false),
    [error, setError] = useState('');
  const allowed =
    props.can('cash.registers.read') &&
    props.can('cash.shifts.read') &&
    (detail.shift.ownerUserId === props.actorUserId || props.can('cash.reports.read'));
  const key = JSON.stringify([
    props.organizationId,
    props.actorUserId,
    props.locationId,
    detail.shift.id,
    detail.shift.version,
    allowed,
  ]);
  const active = useRef(key);
  active.current = key;
  const epoch = useRef(0);
  const load = useCallback(
    async (cursor?: string) => {
      const version = ++epoch.current;
      setError('');
      if (!cursor) setData(null);
      if (!allowed || !expanded) {
        setLoading(false);
        return;
      }
      setLoading(true);
      try {
        const result = await readCashMovements(props.api, detail.shift.id, {
          locationId: props.locationId,
          limit: 50,
          ...(cursor ? { cursor } : {}),
        });
        if (version !== epoch.current || active.current !== key) return;
        setData((previous) => ({
          ...result,
          movements:
            cursor && previous
              ? [
                  ...previous.movements.filter(
                    (old) => !result.movements.some((row) => old.id === row.id),
                  ),
                  ...result.movements,
                ]
              : result.movements,
        }));
        setDataKey(key);
      } catch (failure) {
        if (version === epoch.current && active.current === key) {
          if (isAccessRejection(failure)) setData(null);
          setError(errorMessage(failure));
        }
      } finally {
        if (version === epoch.current && active.current === key) setLoading(false);
      }
    },
    [props.api, props.locationId, detail.shift.id, allowed, expanded, key],
  );
  useEffect(() => {
    void load();
    return () => {
      epoch.current++;
    };
  }, [load]);
  const visible = allowed && dataKey === key ? data : null;
  return {
    data: visible,
    loading,
    error,
    expanded,
    setExpanded,
    refresh: () => load(),
    more: () => (!loading && visible?.nextCursor ? load(visible.nextCursor) : Promise.resolve()),
  };
}
