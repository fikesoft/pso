import { useCallback, useRef, useState } from 'react';
import { readActiveOrders } from '../../../entities/order';
import {
  isAccessRejection,
  useCoalescedInvalidation,
  useInvalidation,
  useRemoteData,
} from '../../../shared/lib';
import { readOrderSearchWindow } from '../lib/order-search-window';
import type { ActiveOrdersInput, ActiveOrdersPage } from './active-orders.types';
export function useActiveOrders({ api, locationId, enabled }: ActiveOrdersInput) {
  const desired = useRef({ locationId, enabled, depth: 1 });
  if (desired.current.locationId !== locationId || desired.current.enabled !== enabled)
    desired.current = { locationId, enabled, depth: 1 };
  const load = useCallback(
    async (): Promise<ActiveOrdersPage> => ({
      ...(enabled
        ? await readActiveOrders(api, locationId)
        : { orders: [], nextCursor: null, timezone: '' }),
      pageDepth: 1,
    }),
    [api, locationId, enabled],
  );
  const orders = useRemoteData(load);
  const current = useRef({ locationId, enabled, orders });
  current.current = { locationId, enabled, orders };
  const paging = useRef(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const refreshWindow = useCallback(async () => {
    const snapshot = current.current;
    if (!snapshot.enabled) return;
    const depth = desired.current.depth;
    await snapshot.orders.revalidate(
      () =>
        readOrderSearchWindow(
          (cursor) => readActiveOrders(api, snapshot.locationId, cursor),
          depth,
        ),
      isAccessRejection,
    );
  }, [api]);
  const signal = useInvalidation(`orders:${locationId}`);
  const liveBusy = useCoalescedInvalidation(signal, refreshWindow);
  async function more() {
    if (!enabled || !orders.data?.nextCursor || orders.loading || paging.current || liveBusy)
      return;
    desired.current.depth = Math.max(desired.current.depth, orders.data.pageDepth + 1);
    paging.current = true;
    setLoadingMore(true);
    try {
      await refreshWindow();
    } finally {
      paging.current = false;
      setLoadingMore(false);
    }
  }
  return { orders: { ...orders, loadingMore }, liveBusy, refreshWindow, more };
}
