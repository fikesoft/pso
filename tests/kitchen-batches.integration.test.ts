import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { prepareOperations, closeOperations } from './api/operations-setup';
import type { KitchenTicket, KitchenTicketBatch } from '../packages/contracts/src';
let f: Awaited<ReturnType<typeof prepareOperations>>;
beforeAll(async () => {
  f = await prepareOperations();
}, 60_000);
afterAll(async () => {
  if (f) await closeOperations(f.owner.id);
});

it('distribuie fiecare articol o dată și așteaptă toate stațiile, inclusiv grupul neatribuit', async () => {
  const locationId = f.a.location.id;
  const { station } = await f.a.primary.expect('/kitchen-stations', 'POST', {
    locationId,
    requestKey: randomUUID(),
    code: 'BAR',
    name: 'Bar istoric',
    sortOrder: 1,
  });
  await f.a.primary.expect('/kitchen-routing', 'PUT', {
    locationId,
    productId: f.product.id,
    stationId: station.id,
    version: 0,
    requestKey: randomUUID(),
  });
  const { order } = await f.a.primary.expect(
    '/orders',
    'POST',
    f.draft({
      items: [
        { productId: f.product.id, quantity: '1.5', note: 'Prima porție' },
        { productId: f.product.id, quantity: '2', note: 'A doua porție' },
        { productId: f.secondProduct.id, quantity: '1' },
      ],
    }),
  );
  const send = { version: order.version, requestKey: randomUUID() };
  const sent = await f.a.primary.expect(`/orders/${order.id}/send`, 'POST', send);
  const ticket: KitchenTicket = sent.ticket;
  expect(ticket.batches).toHaveLength(2);
  const bar = ticket.batches.find((batch) => batch.station?.id === station.id)!;
  const unassigned = ticket.batches.find((batch) => batch.station === null)!;
  expect(bar.station).toEqual({ id: station.id, code: 'BAR', name: 'Bar istoric' });
  expect(bar.ticketItemIds).toHaveLength(2);
  expect(unassigned.ticketItemIds).toHaveLength(1);
  expect(ticket.batches.flatMap((batch) => batch.ticketItemIds).sort()).toEqual(
    ticket.items.map((item) => item.id).sort(),
  );
  expect(ticket.items.map((item) => item.note)).toEqual(['Prima porție', 'A doua porție', null]);
  expect(
    (
      await f.cook.call(`/kitchen/tickets/${ticket.id}`, 'PATCH', {
        version: 1,
        status: 'PREPARING',
      })
    ).status,
  ).toBe(409);
  const path = (batch: KitchenTicketBatch) => `/kitchen/tickets/${ticket.id}/batches/${batch.id}`;
  expect(
    (await f.worker.call(path(bar), 'PATCH', { version: 1, status: 'PREPARING' })).status,
  ).toBe(403);
  expect(
    (await f.b.primary.call(path(bar), 'PATCH', { version: 1, status: 'PREPARING' })).status,
  ).toBe(404);
  expect((await f.cook.call(path(bar), 'PATCH', { version: 1, status: 'READY' })).status).toBe(409);
  // Configuration changes affect only subsequent sends.
  await f.a.primary.expect('/kitchen-routing', 'PUT', {
    locationId,
    productId: f.product.id,
    stationId: null,
    version: 1,
    requestKey: randomUUID(),
  });
  await f.a.primary.expect(`/kitchen-stations/${station.id}`, 'PATCH', {
    locationId,
    version: 1,
    name: 'Bar redenumit',
    sortOrder: 1,
    requestKey: randomUUID(),
  });
  expect((await f.a.primary.expect(`/orders/${order.id}/send`, 'POST', send)).ticket).toEqual(
    ticket,
  );
  await f.cook.expect(path(bar), 'PATCH', { version: 1, status: 'PREPARING' });
  expect((await f.cook.call(path(bar), 'PATCH', { version: 1, status: 'PREPARING' })).status).toBe(
    409,
  );
  const partial = await f.cook.expect(path(bar), 'PATCH', { version: 2, status: 'READY' });
  const finishedBar = partial.ticket.batches.find(
    (batch: KitchenTicketBatch) => batch.id === bar.id,
  )!;
  expect(finishedBar.createdAt).toBe(bar.createdAt);
  expect(Date.parse(finishedBar.updatedAt)).toBeGreaterThanOrEqual(Date.parse(bar.createdAt));
  expect(partial.ticket.status).toBe('PARTIALLY_READY');
  expect((await f.a.primary.expect(`/orders/${order.id}`)).order.status).toBe('IN_PROGRESS');
  const working = await f.cook.expect(path(unassigned), 'PATCH', {
    version: 1,
    status: 'PREPARING',
  });
  expect(working.ticket.status).toBe('PARTIALLY_READY');
  expect(working.ticket.version).toBe(partial.ticket.version + 1);
  const ready = await f.cook.expect(path(unassigned), 'PATCH', { version: 2, status: 'READY' });
  expect(ready.ticket.status).toBe('READY');
  expect(ready.ticket.batches.find((batch: KitchenTicketBatch) => batch.id === bar.id)).toEqual(
    finishedBar,
  );
  expect(ready.ticket.batches.every((batch: KitchenTicketBatch) => batch.status === 'READY')).toBe(
    true,
  );
  expect((await f.a.primary.expect(`/orders/${order.id}`)).order).toMatchObject({
    status: 'IN_PROGRESS',
    kitchenStatus: 'READY',
    packingStatus: 'WAITING',
  });
});

it('stația arhivată blochează trimiterea nouă; anularea oprește toate grupurile istorice', async () => {
  const locationId = f.a.location.id;
  const { station } = await f.a.primary.expect('/kitchen-stations', 'POST', {
    locationId,
    requestKey: randomUUID(),
    code: 'GRILL',
    name: 'Grătar',
    sortOrder: 2,
  });
  await f.a.primary.expect('/kitchen-routing', 'PUT', {
    locationId,
    productId: f.secondProduct.id,
    stationId: station.id,
    version: 0,
    requestKey: randomUUID(),
  });
  const { order } = await f.a.primary.expect(
    '/orders',
    'POST',
    f.draft({
      items: [
        { productId: f.product.id, quantity: '1' },
        { productId: f.secondProduct.id, quantity: '1' },
      ],
    }),
  );
  const { ticket } = await f.a.primary.expect(`/orders/${order.id}/send`, 'POST', {
    version: 1,
    requestKey: randomUUID(),
  });
  await f.a.primary.expect(`/kitchen-stations/${station.id}/archive`, 'POST', {
    locationId,
    version: 1,
    requestKey: randomUUID(),
  });
  const batch = ticket.batches.find((entry: KitchenTicketBatch) => entry.station !== null);
  const prepared = await f.cook.expect(
    `/kitchen/tickets/${ticket.id}/batches/${batch.id}`,
    'PATCH',
    { version: 1, status: 'PREPARING' },
  );
  expect(prepared.ticket.status).toBe('PREPARING');
  const draft = (
    await f.a.primary.expect(
      '/orders',
      'POST',
      f.draft({ items: [{ productId: f.secondProduct.id, quantity: '1' }] }),
    )
  ).order;
  expect(
    (
      await f.a.primary.call(`/orders/${draft.id}/send`, 'POST', {
        version: 1,
        requestKey: randomUUID(),
      })
    ).status,
  ).toBe(409);
  expect((await f.a.primary.expect(`/orders/${draft.id}`)).order).toMatchObject({
    status: 'DRAFT',
    kitchenStatus: 'NOT_SENT',
  });
  const current = (await f.a.primary.expect(`/orders/${order.id}`)).order;
  await f.a.primary.expect(`/orders/${order.id}/cancel`, 'POST', {
    version: current.version,
    requestKey: randomUUID(),
    reason: 'Anulare sintetică',
  });
  expect(
    (
      await f.cook.call(`/kitchen/tickets/${ticket.id}/batches/${batch.id}`, 'PATCH', {
        version: 2,
        status: 'READY',
      })
    ).status,
  ).toBe(409);
});
