import { useCallback, useEffect, useRef, useState } from 'react';
import type { CourierWorkListResponse } from '@pos/contracts';
import { errorMessage } from '@pos/ui/api';
import { readCourierWork } from '../../../entities/courier-work';
import type { CourierWorkProps, CourierWorkView } from './courier-work.types';
export function useCourierWorkList({ api, actorUserId, locationId, canRead }: CourierWorkProps) {
  const [view, setView] = useState<CourierWorkView>('ACTIVE');
  const [data, setData] = useState<CourierWorkListResponse | null>(null);
  const [loading, setLoading] = useState(false),
    [error, setError] = useState('');
  const generation = useRef(0);
  const load = useCallback(
    async (cursor?: string) => {
      const request = ++generation.current;
      if (!canRead) {
        setData(null);
        setLoading(false);
        return;
      }
      setLoading(true);
      setError('');
      if (!cursor) setData(null);
      try {
        const response = await readCourierWork(api, actorUserId, {
          locationId,
          view,
          limit: 20,
          ...(cursor ? { cursor } : {}),
        });
        if (request !== generation.current) return;
        setData((current) => ({
          ...response,
          orders:
            cursor && current
              ? [
                  ...current.orders.filter(
                    (old) => !response.orders.some((next) => next.orderId === old.orderId),
                  ),
                  ...response.orders,
                ]
              : response.orders,
        }));
      } catch (failure) {
        if (request === generation.current) {
          setData(null);
          setError(errorMessage(failure));
        }
      } finally {
        if (request === generation.current) setLoading(false);
      }
    },
    [api, actorUserId, locationId, view, canRead],
  );
  useEffect(() => {
    void load();
    return () => {
      generation.current++;
    };
  }, [load]);
  return {
    view,
    setView,
    data,
    loading,
    error,
    refresh: () => load(),
    more: () => (!loading && data?.nextCursor ? load(data.nextCursor) : Promise.resolve()),
    invalidate: () => {
      generation.current++;
      setData(null);
      setLoading(false);
    },
  };
}
