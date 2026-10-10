import { randomUUID } from 'node:crypto';
import { expect } from 'vitest';
import type { OperationsFixture } from './operations.types';

export async function verifyOperationPagination(f: OperationsFixture) {
  const query = `locationId=${f.a.location.id}&limit=1`;
  const catalog = await f.worker.expect(`/catalog?${query}`);
  expect(catalog.products).toHaveLength(1);
  expect(catalog.nextCursor).toBeTruthy();
  const catalogNext = await f.worker.expect(`/catalog?${query}&cursor=${catalog.nextCursor}`);
  expect(catalogNext.products).toHaveLength(1);
  expect(catalogNext.products[0].id).not.toBe(catalog.products[0].id);
  expect(catalogNext.nextCursor).toBeNull();
  const first = await f.worker.expect(`/orders?${query}`);
  const second = await f.worker.expect(`/orders?${query}&cursor=${first.nextCursor}`);
  expect(second.orders[0].number).toBeLessThan(first.orders[0].number);
  expect(second.orders[0].id).not.toBe(first.orders[0].id);
  expect((await f.worker.call(`/orders?${query}&cursor=${randomUUID()}`)).status).toBe(400);
  const draft = (await f.worker.expect('/orders', 'POST', f.draft())).order;
  await f.worker.expect(`/orders/${draft.id}/send`, 'POST', {
    version: 1,
    requestKey: randomUUID(),
  });
  const tickets = await f.cook.expect(`/kitchen/tickets?${query}`);
  const ticketNext = await f.cook.expect(`/kitchen/tickets?${query}&cursor=${tickets.nextCursor}`);
  expect(ticketNext.tickets[0].id).not.toBe(tickets.tickets[0].id);
  expect(new Date(ticketNext.tickets[0].createdAt).valueOf()).toBeGreaterThanOrEqual(
    new Date(tickets.tickets[0].createdAt).valueOf(),
  );
  expect((await f.cook.call(`/kitchen/tickets?${query}&cursor=${randomUUID()}`)).status).toBe(400);
  const ready = await f.cook.expect(`/kitchen/tickets?${query}&status=READY`);
  expect(ready.tickets.every((ticket: any) => ticket.status === 'READY')).toBe(true);
  const audit = await f.a.primary.expect(`/audit?locationId=${f.a.location.id}`);
  const actions = audit.events.map((event: any) => event.action);
  expect(actions).toEqual(
    expect.arrayContaining([
      'orders.created',
      'orders.draft.updated',
      'orders.sent',
      'kitchen.status.updated',
    ]),
  );
}
