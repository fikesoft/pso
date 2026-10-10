import { useCallback, useState } from 'react';
import { useRemoteData } from '../../../shared/lib';
import { readInbox } from '../api/website.api';
import type { WebsiteInboxProps, WebsiteStatusFilter } from './website-delivery.types';
export function useWebsiteInbox({ api, locationId }: WebsiteInboxProps) {
  const [status, setStatus] = useState<WebsiteStatusFilter>('AWAITING_ACCEPTANCE');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const load = useCallback(() => readInbox(api, locationId, status), [api, locationId, status]);
  const orders = useRemoteData(load);
  async function more() {
    const cursor = orders.data?.nextCursor;
    if (!cursor) return;
    await orders.append(
      () => readInbox(api, locationId, status, cursor),
      (current, page) => ({ ...page, orders: [...current.orders, ...page.orders] }),
    );
  }
  return { status, setStatus, selectedId, setSelectedId, orders, more };
}
