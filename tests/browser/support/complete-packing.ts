import { randomUUID } from 'node:crypto';
import { expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import type { Order, PackingSessionDto } from '../../../packages/contracts/src';
import { api } from './browser-helpers';

export async function completePacking(page: Page, orderId: string): Promise<Order> {
  const request = async (path: string, body?: unknown) => {
    const response = await api(page, path, body);
    expect(response.status(), path).toBe(200);
    return response.json();
  };
  const { order }: { order: Order } = await request(`/orders/${orderId}`);
  if (order.packingStatus === 'READY') return order;
  expect(order.packingStatus).not.toBe('NOT_REQUIRED');
  let cursor: string | null = null;
  let session: PackingSessionDto | undefined;
  do {
    const result = await request(
      `/packing/sessions?locationId=${order.locationId}&limit=100${cursor ? `&cursor=${cursor}` : ''}`,
    );
    session = (result.sessions as PackingSessionDto[]).find((row) => row.orderId === orderId);
    cursor = result.nextCursor;
  } while (!session && cursor);
  expect(session).toBeDefined();
  const path = `/packing/sessions/${session!.id}/commands`;
  let version = session!.version;
  if (session!.status === 'WAITING')
    await request(path, { action: 'START', version: version++, requestKey: randomUUID() });
  for (const item of session!.items)
    if (!item.checked)
      await request(path, {
        action: 'CHECK_ITEM',
        itemId: item.id,
        checked: true,
        version: version++,
        requestKey: randomUUID(),
      });
  await request(path, { action: 'COMPLETE', version, requestKey: randomUUID() });
  return (await request(`/orders/${orderId}`)).order;
}
