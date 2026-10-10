import { readOrderSearchWindow } from '../lib/order-search-window';
import { useCallback, useRef, useState } from 'react';
import type { OrderSearchRequest } from '@pos/contracts';
import { searchOrders, readOrderCreators } from '../../../entities/order';
import {
  useRemoteData,
  useInvalidation,
  useCoalescedInvalidation,
  isAccessRejection,
} from '../../../shared/lib';
import { EMPTY_ORDER_SEARCH } from '../config/order-search.constants';
import { orderSearchInput } from '../lib/order-search';
import type { OrderSearchFields, OrderSearchInput, OrderSearchPage } from './order-search.types';
export function useOrderSearch({ api, locationId, enabled }: OrderSearchInput) {
  const [fields, setFields] = useState({ ...EMPTY_ORDER_SEARCH });
  const [applied, setApplied] = useState<OrderSearchRequest>({ locationId });
  const [error, setError] = useState('');
  const desired = useRef({ applied, depth: 1 });
  if (desired.current.applied !== applied) desired.current = { applied, depth: 1 };
  const paging = useRef(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const load = useCallback(
    async (): Promise<OrderSearchPage> => ({
      ...(enabled
        ? await searchOrders(api, applied)
        : { orders: [], nextCursor: null, timezone: '' }),
      pageDepth: 1,
    }),
    [api, applied, enabled],
  );
  const orders = useRemoteData(load);
  const current = useRef({ applied, orders, enabled });
  current.current = { applied, orders, enabled };
  const signal = useInvalidation(`orders:${locationId}`);
  const refreshWindow = useCallback(async () => {
    const snapshot = current.current;
    if (!snapshot.enabled) return;
    const depth = desired.current.depth;
    await snapshot.orders.revalidate(
      () =>
        readOrderSearchWindow(
          (cursor) => searchOrders(api, { ...snapshot.applied, ...(cursor ? { cursor } : {}) }),
          depth,
        ),
      isAccessRejection,
    );
  }, [api]);
  const liveBusy = useCoalescedInvalidation(signal, refreshWindow);
  const loadCreators = useCallback(
    () =>
      enabled
        ? readOrderCreators(api, locationId)
        : Promise.resolve({ creators: [], nextCursor: null }),
    [api, locationId, enabled],
  );
  const creators = useRemoteData(loadCreators);
  function patch(patch: Partial<OrderSearchFields>) {
    setFields((current) => ({ ...current, ...patch }));
  }
  function apply() {
    try {
      setApplied(orderSearchInput(fields, locationId));
      setError('');
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Filtre invalide');
    }
  }
  function reset() {
    setFields({ ...EMPTY_ORDER_SEARCH });
    setApplied({ locationId });
    setError('');
  }
  async function more() {
    if (!orders.data?.nextCursor || orders.loading || liveBusy || paging.current) return;
    desired.current.depth++;
    paging.current = true;
    setLoadingMore(true);
    try {
      await refreshWindow();
    } finally {
      paging.current = false;
      setLoadingMore(false);
    }
  }
  async function moreCreators() {
    const cursor = creators.data?.nextCursor;
    if (!cursor || creators.loading) return;
    await creators.append(
      () => readOrderCreators(api, locationId, cursor),
      (current, page) => {
        const byId = new Map(current.creators.map((creator) => [creator.id, creator]));
        for (const creator of page.creators) byId.set(creator.id, creator);
        return { ...page, creators: [...byId.values()] };
      },
    );
  }
  return {
    orders: { ...orders, loadingMore },
    liveBusy,
    refreshWindow,
    creators,
    fields,
    patch,
    apply,
    reset,
    error,
    more,
    moreCreators,
    filtered: Object.keys(applied).some((key) => key !== 'locationId'),
  };
}
