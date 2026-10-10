import { useCallback, useEffect, useRef, useState } from 'react';
import type { DeliveryZoneListResponse } from '@pos/contracts';
import { errorMessage } from '@pos/ui/api';
import { readDeliveryZones } from '../../../entities/delivery-zone';
import type { DeliveryZonesProps, ZoneFilter } from './delivery-zone.types';

export function useZoneList({ api, locationId, canRead }: DeliveryZonesProps) {
  const [filter, setFilter] = useState<ZoneFilter>('ACTIVE');
  const [data, setData] = useState<DeliveryZoneListResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const version = useRef(0);
  const status = filter;
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
        const result = await readDeliveryZones(api, {
          locationId,
          status,
          limit: 30,
          ...(cursor ? { cursor } : {}),
        });
        if (request !== version.current) return false;
        setData((current) => ({
          ...result,
          zones:
            cursor && current
              ? [
                  ...current.zones.filter(
                    (old) => !result.zones.some((next) => next.id === old.id),
                  ),
                  ...result.zones,
                ]
              : result.zones,
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
    [api, locationId, status, canRead],
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
