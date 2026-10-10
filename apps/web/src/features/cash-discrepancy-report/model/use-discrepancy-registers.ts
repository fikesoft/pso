import { useCallback, useEffect, useRef, useState } from 'react';
import type {
  CashDiscrepancyRegisterQuery,
  CashDiscrepancyRegisterResponse,
} from '@pos/contracts/cash-discrepancies';
import { errorMessage } from '@pos/ui/api';
import { readDiscrepancyRegisters } from '../../../entities/cash-shift';
import { isAccessRejection } from '../../../shared/lib';
import type { CashDiscrepancyProps } from './cash-discrepancy.types';
export function useDiscrepancyRegisters(
  props: CashDiscrepancyProps,
  query: CashDiscrepancyRegisterQuery | null,
  onDenied: () => void,
) {
  const key = JSON.stringify([
    props.organizationId,
    props.actorUserId,
    props.locationId,
    props.allowed,
    query,
  ]);
  const current = useRef(key);
  current.current = key;
  const epoch = useRef(0);
  const [data, setData] = useState<CashDiscrepancyRegisterResponse | null>(null);
  const [dataKey, setDataKey] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const load = useCallback(
    async (cursor?: string) => {
      const version = ++epoch.current;
      setError('');
      if (!cursor) setData(null);
      if (!props.allowed || !query || query.locationId !== props.locationId) {
        setLoading(false);
        return;
      }
      setLoading(true);
      try {
        const result = await readDiscrepancyRegisters(props.api, {
          ...query,
          ...(cursor ? { cursor } : {}),
        });
        if (version !== epoch.current || current.current !== key) return;
        setData((previous) => ({
          ...result,
          registers:
            cursor && previous
              ? [
                  ...previous.registers.filter(
                    (old) => !result.registers.some((row) => row.registerId === old.registerId),
                  ),
                  ...result.registers,
                ]
              : result.registers,
        }));
        setDataKey(key);
      } catch (failure) {
        if (version === epoch.current && current.current === key) {
          if (isAccessRejection(failure)) {
            setData(null);
            onDenied();
          }
          setError(errorMessage(failure));
        }
      } finally {
        if (version === epoch.current && current.current === key) setLoading(false);
      }
    },
    [props.api, props.allowed, props.locationId, query, key, onDenied],
  );
  useEffect(() => {
    void load();
    return () => {
      epoch.current++;
    };
  }, [load]);
  const visible = props.allowed && dataKey === key ? data : null;
  return {
    invalidate: () => {
      epoch.current++;
      setData(null);
      setLoading(false);
    },
    data: visible,
    loading,
    error,
    refresh: () => load(),
    more: () => (!loading && visible?.nextCursor ? load(visible.nextCursor) : Promise.resolve()),
  };
}
