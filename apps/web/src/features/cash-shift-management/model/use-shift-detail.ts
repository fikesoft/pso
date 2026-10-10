import { useCallback, useEffect, useRef, useState } from 'react';
import type { CashShiftDetailResponse } from '@pos/contracts';
import { errorMessage } from '@pos/ui/api';
import { readCashShift } from '../../../entities/cash-shift';
import type { CashShiftManagementProps } from './shift-management.types';
export function useShiftDetail(props: CashShiftManagementProps, id: string) {
  const [data, setData] = useState<CashShiftDetailResponse | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const revision = useRef(0);
  const allowed = props.can('cash.registers.read') && props.can('cash.shifts.read');
  const canReport = props.can('cash.reports.read');
  const load = useCallback(async () => {
    const version = ++revision.current;
    setData(null);
    setError('');
    if (!id || !allowed) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const next = await readCashShift(props.api, id, props.locationId);
      if (version === revision.current) setData(next);
    } catch (failure) {
      if (version === revision.current) setError(errorMessage(failure));
    } finally {
      if (version === revision.current) setLoading(false);
    }
  }, [props.api, props.locationId, props.actorUserId, id, allowed, canReport]);
  useEffect(() => {
    void load();
    return () => {
      revision.current++;
    };
  }, [load]);
  return {
    data:
      allowed &&
      data?.shift.id === id &&
      (data.shift.ownerUserId === props.actorUserId || canReport)
        ? data
        : null,
    error,
    loading,
    refresh: load,
  };
}
