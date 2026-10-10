import { useCallback, useEffect, useRef, useState } from 'react';
import type { CashRegisterListResponse } from '@pos/contracts';
import { errorMessage } from '@pos/ui/api';
import { readCashRegisters } from '../../../entities/cash-register';
import { isAccessRejection } from '../../../shared/lib';
import type { CashRegisterManagementProps, RegisterFilter } from './register-management.types';

export function useRegisterList({
  api,
  locationId,
  canRead,
  canManage,
}: CashRegisterManagementProps) {
  const [filter, setFilter] = useState<RegisterFilter>('ACTIVE');
  const [data, setData] = useState<CashRegisterListResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const version = useRef(0);
  const status = canManage ? filter : 'ACTIVE';
  const load = useCallback(
    async (cursor?: string) => {
      if (!canRead) {
        version.current++;
        setData(null);
        setLoading(false);
        return false;
      }
      const request = ++version.current;
      setLoading(true);
      setError('');
      if (!cursor) setData(null);
      try {
        const result = await readCashRegisters(api, {
          locationId,
          status,
          limit: 50,
          ...(cursor ? { cursor } : {}),
        });
        if (request !== version.current) return false;
        setData((current) => ({
          ...result,
          registers:
            cursor && current
              ? [
                  ...current.registers.filter(
                    (old) => !result.registers.some((next) => next.id === old.id),
                  ),
                  ...result.registers,
                ]
              : result.registers,
        }));
        return true;
      } catch (failure) {
        if (request === version.current) {
          if (isAccessRejection(failure)) setData(null);
          setError(errorMessage(failure));
        }
        return false;
      } finally {
        if (request === version.current) setLoading(false);
      }
    },
    [api, locationId, status, canRead],
  );
  useEffect(() => {
    void load();
    return () => {
      version.current++;
    };
  }, [load]);
  return {
    data,
    loading,
    error,
    filter: status,
    setFilter,
    refresh: () => load(),
    more: () => (!loading && data?.nextCursor ? load(data.nextCursor) : Promise.resolve(false)),
  };
}
