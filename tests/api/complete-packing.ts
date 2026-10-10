import { randomUUID } from 'node:crypto';
import { expect } from 'vitest';
import type { Order, PackingSessionDto } from '../../packages/contracts/src';
import type { BrowserSession } from './support/harness';

// Fixture preparation must use the same authorized checklist as an operator.
export async function completePacking(primary: BrowserSession, orderId: string): Promise<Order> {
  const { order }: { order: Order } = await primary.expect(`/orders/${orderId}`);
  if (order.packingStatus === 'READY') return order;
  expect(order.packingStatus).not.toBe('NOT_REQUIRED');
  let cursor: string | null = null;
  let session: PackingSessionDto | undefined;
  do {
    const page = await primary.expect(
      `/packing/sessions?locationId=${order.locationId}&limit=100${cursor ? `&cursor=${cursor}` : ''}`,
    );
    session = (page.sessions as PackingSessionDto[]).find((row) => row.orderId === orderId);
    cursor = page.nextCursor;
  } while (!session && cursor);
  expect(session, 'Sesiunea de ambalare trebuie creată la trimitere').toBeDefined();
  const path = `/packing/sessions/${session!.id}/commands`;
  let version = session!.version;
  if (session!.status === 'WAITING')
    await primary.expect(path, 'POST', {
      action: 'START',
      version: version++,
      requestKey: randomUUID(),
    });
  for (const item of session!.items)
    if (!item.checked)
      await primary.expect(path, 'POST', {
        action: 'CHECK_ITEM',
        itemId: item.id,
        checked: true,
        version: version++,
        requestKey: randomUUID(),
      });
  await primary.expect(path, 'POST', { action: 'COMPLETE', version, requestKey: randomUUID() });
  return (await primary.expect(`/orders/${orderId}`)).order;
}
