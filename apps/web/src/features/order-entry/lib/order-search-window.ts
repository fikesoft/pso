import type { Order, OrderSearchResponse } from '@pos/contracts';
export async function readOrderSearchWindow<T extends Order = Order>(
  load: (cursor?: string) => Promise<Omit<OrderSearchResponse, 'orders'> & { orders: T[] }>,
  depth: number,
) {
  const first = await load();
  const byId = new Map(first.orders.map((order) => [order.id, order]));
  let cursor = first.nextCursor;
  let pageDepth = 1;
  while (cursor && pageDepth < depth) {
    const page = await load(cursor);
    for (const order of page.orders) {
      const previous = byId.get(order.id);
      if (!previous || order.version >= previous.version) byId.set(order.id, order);
    }
    cursor = page.nextCursor;
    pageDepth++;
  }
  return { ...first, orders: [...byId.values()], nextCursor: cursor, pageDepth };
}
