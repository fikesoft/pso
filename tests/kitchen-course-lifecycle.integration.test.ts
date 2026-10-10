import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, expect, it } from 'vitest';
import type { KitchenTicket, Order } from '../packages/contracts/src';
import { prepareOperations, closeOperations } from './api/operations-setup';

let f: Awaited<ReturnType<typeof prepareOperations>>;
beforeAll(async () => {
  f = await prepareOperations();
}, 60_000);
afterAll(async () => {
  if (f) await closeOperations(f.owner.id);
});

it('filtrul fără stație agregă toate etapele înainte de paginare', async () => {
  const { order }: { order: Order } = await f.a.primary.expect(
    '/orders',
    'POST',
    f.draft({
      items: [1, 2].map((courseNumber) => ({
        productId: f.product.id,
        quantity: '1',
        courseNumber,
      })),
    }),
  );
  const { ticket }: { ticket: KitchenTicket } = await f.a.primary.expect(
    `/orders/${order.id}/send`,
    'POST',
    { version: order.version, requestKey: randomUUID() },
  );
  await f.a.primary.expect(`/kitchen/tickets/${ticket.id}/fire`, 'POST', {
    version: 1,
    requestKey: randomUUID(),
    course: 1,
  });
  const batch = ticket.batches.find((row) => row.courseNumber === 1)!;
  const path = `/kitchen/tickets/${ticket.id}/batches/${batch.id}`;
  await f.cook.expect(path, 'PATCH', { version: 2, status: 'PREPARING' });
  await f.cook.expect(path, 'PATCH', { version: 3, status: 'READY' });
  for (const status of ['QUEUED', 'PREPARING', 'PARTIALLY_READY', 'READY']) {
    const result = await f.cook.expect(
      `/kitchen/tickets?locationId=${f.a.location.id}&stationId=UNASSIGNED&status=${status}`,
    );
    expect(result.tickets.some((row: KitchenTicket) => row.id === ticket.id)).toBe(
      status === 'PARTIALLY_READY',
    );
  }
});

it('editarea etapei este permisă în ciornă și se fixează la trimitere', async () => {
  const { order }: { order: Order } = await f.a.primary.expect(
    '/orders',
    'POST',
    f.draft({
      items: [{ productId: f.product.id, quantity: '1', courseNumber: 1 }],
    }),
  );
  const body = {
    version: order.version,
    serviceType: 'DINE_IN',
    tableLabel: '7',
    items: [{ id: order.items[0]!.id, productId: f.product.id, quantity: '1', courseNumber: 2 }],
  };
  const edited = await f.a.primary.expect(`/orders/${order.id}`, 'PATCH', body);
  expect(edited.order.items[0].courseNumber).toBe(2);
  const omitted = {
    ...body,
    version: edited.order.version,
    items: body.items.map(({ courseNumber: _course, ...item }) => item),
  };
  const preserved = await f.a.primary.expect(`/orders/${order.id}`, 'PATCH', omitted);
  expect(preserved.order.items[0].courseNumber).toBe(2);
  const { ticket }: { ticket: KitchenTicket } = await f.a.primary.expect(
    `/orders/${order.id}/send`,
    'POST',
    { version: preserved.order.version, requestKey: randomUUID() },
  );
  expect(ticket.items[0]!.courseNumber).toBe(2);
  expect(ticket.batches[0]!.courseNumber).toBe(2);
  expect(ticket.batches[0]!.firedAt).toBeNull();
  expect(
    (
      await f.a.primary.call(`/orders/${order.id}`, 'PATCH', {
        ...body,
        version: preserved.order.version + 1,
      })
    ).status,
  ).toBe(409);
});

it('anularea închide etapele lansate și nelansate și păstrează replay-ul istoric', async () => {
  const { order }: { order: Order } = await f.a.primary.expect(
    '/orders',
    'POST',
    f.draft({
      items: [1, 3].map((courseNumber) => ({
        productId: f.product.id,
        quantity: '1',
        courseNumber,
      })),
    }),
  );
  const send = { version: order.version, requestKey: randomUUID() };
  const { ticket }: { ticket: KitchenTicket } = await f.a.primary.expect(
    `/orders/${order.id}/send`,
    'POST',
    send,
  );
  const body = { version: 1, requestKey: randomUUID(), course: 1 };
  const path = `/kitchen/tickets/${ticket.id}/fire`;
  const fired = await f.a.primary.expect(path, 'POST', body);
  const current = await f.a.primary.expect(`/orders/${order.id}`);
  await f.a.primary.expect(`/orders/${order.id}/cancel`, 'POST', {
    version: current.order.version,
    requestKey: randomUUID(),
    reason: 'Anulare sintetică a etapelor',
  });
  const replay = await f.a.primary.expect(`/orders/${order.id}/send`, 'POST', send);
  expect(replay.ticket.status).toBe('CANCELLED');
  expect(
    replay.ticket.batches.every(
      (batch: KitchenTicket['batches'][number]) => batch.status === 'CANCELLED',
    ),
  ).toBe(true);
  expect(
    replay.ticket.batches.find(
      (batch: KitchenTicket['batches'][number]) => batch.courseNumber === 3,
    ).firedAt,
  ).toBeNull();
  expect(await f.a.primary.expect(path, 'POST', body)).toEqual(fired);
  expect(
    (
      await f.a.primary.call(path, 'POST', {
        version: replay.ticket.version,
        requestKey: randomUUID(),
        course: 'ALL',
      })
    ).status,
  ).toBe(409);
});
