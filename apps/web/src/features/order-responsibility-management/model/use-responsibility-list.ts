import { useCallback, useEffect, useRef, useState } from 'react';
import type {
  OrderResponsibilityListRequest,
  OrderResponsibilityListResponse,
} from '@pos/contracts/order-responsibilities';
import { errorMessage } from '@pos/ui/api';
import { readResponsibilities } from '../../../entities/order-responsibility';
import { isAccessRejection } from '../../../shared/lib';
import type { ResponsibilityProps } from './responsibility-management.types';
export function useResponsibilityList(
  props: ResponsibilityProps,
  query: OrderResponsibilityListRequest | null,
  allowed: boolean,
) {
  const [data, setData] = useState<OrderResponsibilityListResponse | null>(null),
    [dataKey, setDataKey] = useState('');
  const [loading, setLoading] = useState(false),
    [error, setError] = useState('');
  const key = JSON.stringify([
    props.organizationId,
    props.actorUserId,
    props.locationId,
    allowed,
    query,
  ]);
  const current = useRef(key);
  current.current = key;
  const epoch = useRef(0);
  const load = useCallback(
    async (cursor?: string) => {
      const revision = ++epoch.current;
      setError('');
      if (!cursor) setData(null);
      if (!allowed || !query || query.locationId !== props.locationId) {
        setLoading(false);
        return;
      }
      setLoading(true);
      try {
        const result = await readResponsibilities(props.api, {
          ...query,
          ...(cursor ? { cursor } : {}),
        });
        if (revision !== epoch.current || current.current !== key) return;
        setData((previous) => ({
          ...result,
          orders:
            cursor && previous
              ? [
                  ...previous.orders.filter(
                    (old) => !result.orders.some((row) => row.order.id === old.order.id),
                  ),
                  ...result.orders,
                ]
              : result.orders,
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
    [props.api, props.locationId, allowed, query, key],
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
    refresh: () => load(),
    more: () => (!loading && visible?.nextCursor ? load(visible.nextCursor) : Promise.resolve()),
  };
}
