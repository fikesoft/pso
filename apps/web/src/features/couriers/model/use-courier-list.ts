import { useCallback, useEffect, useRef, useState } from 'react';
import type { CourierListResponse } from '@pos/contracts';
import { errorMessage } from '@pos/ui/api';
import { readCouriers, readOwnCourier } from '../../../entities/courier';
import type { CouriersProps, CourierFilter } from './courier.types';

export function useCourierList({ api, locationId, actorUserId, canRead, canOwn }: CouriersProps) {
  const [filter, setFilter] = useState<CourierFilter>('ACTIVE');
  const [data, setData] = useState<CourierListResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const version = useRef(0);
  const status = filter;
  const load = useCallback(
    async (cursor?: string) => {
      if (!canRead && !canOwn) {
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
        const result = canRead
          ? await readCouriers(api, {
              locationId,
              status,
              limit: 30,
              ...(cursor ? { cursor } : {}),
            })
          : await readOwnCourier(api, locationId, actorUserId);
        if (request !== version.current) return false;
        setData((current) => ({
          ...result,
          couriers:
            cursor && current
              ? [
                  ...current.couriers.filter(
                    (old) => !result.couriers.some((next) => next.id === old.id),
                  ),
                  ...result.couriers,
                ]
              : result.couriers,
        }));
        return true;
      } catch (failure) {
        if (request === version.current) {
          setData(null);
          setError(errorMessage(failure));
        }
        return false;
      } finally {
        if (request === version.current) setLoading(false);
      }
    },
    [api, locationId, actorUserId, status, canRead, canOwn],
  );
  useEffect(() => {
    void load();
    return () => {
      version.current++;
    };
  }, [load]);
  return {
    invalidate: () => {
      version.current++;
      setData(null);
      setLoading(false);
    },
    data,
    loading,
    error,
    filter: status,
    setFilter,
    refresh: () => load(),
    more: () => (!loading && data?.nextCursor ? load(data.nextCursor) : Promise.resolve(false)),
  };
}
