import { useCallback, useRef, useState } from 'react';
import type { CustomerHistoryResponse, OrderStatus } from '@pos/contracts';
import { readCustomerHistory } from '../../../entities/customer';
import { useRemoteData } from '../../../shared/lib';
import type { CustomerHistoryProps } from './customer-history.types';

export function useCustomerHistory({ api, customerId, locationId }: CustomerHistoryProps) {
  const [status, setStatus] = useState<OrderStatus | ''>('');
  const depth = useRef(1);
  const load = useCallback(async () => {
    let page: CustomerHistoryResponse | null = null;
    const orders: CustomerHistoryResponse['orders'] = [];
    for (let i = 0; i < depth.current; i++) {
      page = await readCustomerHistory(api, customerId, {
        locationId,
        limit: 20,
        status: status || undefined,
        cursor: page?.nextCursor ?? undefined,
      });
      orders.push(...page.orders);
      if (!page.nextCursor) break;
    }
    return { ...page!, orders };
  }, [api, customerId, locationId, status]);
  const list = useRemoteData(load);
  async function refresh(more = false) {
    if (list.loading) return;
    if (more && list.data?.nextCursor) depth.current++;
    list.setData(null);
    await list.refresh();
  }
  function filter(value: OrderStatus | '') {
    depth.current = 1;
    list.setData(null);
    setStatus(value);
  }
  return { list, status, filter, refresh };
}
