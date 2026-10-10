import { useCallback, useRef, useState } from 'react';
import { readOrderTimeline } from '../../../entities/order';
import {
  useRemoteData,
  useInvalidation,
  useCoalescedInvalidation,
  isAccessRejection,
} from '../../../shared/lib';
import type { OrderTimelineProps } from './order-timeline.types';
export function useOrderTimeline({ api, orderId, locationId, version }: OrderTimelineProps) {
  const load = useCallback(
    async () => ({ ...(await readOrderTimeline(api, orderId)), pageDepth: 1 }),
    [api, orderId],
  );
  const desired = useRef({ orderId, depth: 1 });
  if (desired.current.orderId !== orderId) desired.current = { orderId, depth: 1 };
  const paging = useRef(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const history = useRemoteData(load);
  const current = useRef(history);
  current.current = history;
  const signal = useInvalidation(`orders:${locationId}`);
  const refreshWindow = useCallback(async () => {
    const resource = current.current;
    const depth = desired.current.depth;
    await resource.revalidate(async () => {
      const first = await readOrderTimeline(api, orderId);
      const events = new Map(first.events.map((event) => [event.id, event]));
      let cursor = first.nextCursor;
      let pageDepth = 1;
      while (cursor && pageDepth < depth) {
        const page = await readOrderTimeline(api, orderId, cursor);
        for (const event of page.events) events.set(event.id, event);
        cursor = page.nextCursor;
        pageDepth++;
      }
      return { ...first, events: [...events.values()], nextCursor: cursor, pageDepth };
    }, isAccessRejection);
  }, [api, orderId]);
  const liveBusy = useCoalescedInvalidation(signal + version, refreshWindow);
  async function more() {
    if (!history.data?.nextCursor || history.loading || liveBusy || paging.current) return;
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
  return { ...history, loadingMore, liveBusy, more, refresh: refreshWindow };
}
