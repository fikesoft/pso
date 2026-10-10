import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, expect, it } from 'vitest';
import type { KitchenTicket } from '../packages/contracts/src';
import { prepareOperations, closeOperations } from './api/operations-setup';
let f: Awaited<ReturnType<typeof prepareOperations>>;
beforeAll(async () => {
  f = await prepareOperations();
}, 60_000);
afterAll(async () => {
  if (f) await closeOperations(f.owner.id);
});
it('filtrează înaintea paginării după starea stației, păstrând starea agregată a comenzii', async () => {
  const locationId = f.a.location.id;
  const { station } = await f.a.primary.expect('/kitchen-stations', 'POST', {
    locationId,
    requestKey: randomUUID(),
    code: 'BAR',
    name: 'Bar de filtrat',
    sortOrder: 0,
  });
  await f.a.primary.expect('/kitchen-routing', 'PUT', {
    locationId,
    productId: f.product.id,
    stationId: station.id,
    version: 0,
    requestKey: randomUUID(),
  });
  async function send(productIds: string[]): Promise<KitchenTicket> {
    const { order } = await f.a.primary.expect(
      '/orders',
      'POST',
      f.draft({
        items: productIds.map((productId) => ({ productId, quantity: '1' })),
      }),
    );
    return (
      await f.a.primary.expect(`/orders/${order.id}/send`, 'POST', {
        version: order.version,
        requestKey: randomUUID(),
      })
    ).ticket;
  }
  const unassigned = await send([f.secondProduct.id]);
  const mixed = await send([f.product.id, f.secondProduct.id]);
  const assigned = await send([f.product.id]);
  const base = `/kitchen/tickets?locationId=${locationId}&stationId=${station.id}`;
  const first = await f.cook.expect(`${base}&status=QUEUED&limit=1`);
  expect(first.tickets.map((ticket: KitchenTicket) => ticket.id)).toEqual([mixed.id]);
  expect(first.nextCursor).toBe(mixed.id);
  const second = await f.cook.expect(`${base}&status=QUEUED&limit=1&cursor=${first.nextCursor}`);
  expect(second.tickets.map((ticket: KitchenTicket) => ticket.id)).toEqual([assigned.id]);
  expect(second.nextCursor).toBeNull();
  expect((await f.cook.call(`${base}&cursor=${unassigned.id}`)).status).toBe(400);
  const batch = mixed.batches.find((entry) => entry.station?.id === station.id)!;
  const path = `/kitchen/tickets/${mixed.id}/batches/${batch.id}`;
  await f.cook.expect(path, 'PATCH', { version: 1, status: 'PREPARING' });
  await f.cook.expect(path, 'PATCH', { version: 2, status: 'READY' });
  const ready = await f.cook.expect(`${base}&status=READY`);
  expect(ready.tickets.map((ticket: KitchenTicket) => ticket.id)).toEqual([mixed.id]);
  expect(ready.tickets[0].status).toBe('PARTIALLY_READY');
  expect((await f.cook.expect(`${base}&status=PARTIALLY_READY`)).tickets).toEqual([]);
  const remaining = await f.cook.expect(
    `/kitchen/tickets?locationId=${locationId}&stationId=UNASSIGNED&status=QUEUED`,
  );
  expect(remaining.tickets.map((ticket: KitchenTicket) => ticket.id)).toEqual([
    unassigned.id,
    mixed.id,
  ]);
  // Archived stations still have in-flight tickets; kitchen readers can select their history.
  await f.a.primary.expect(`/kitchen-stations/${station.id}/archive`, 'POST', {
    locationId,
    version: 1,
    requestKey: randomUUID(),
  });
  const unused = (
    await f.a.primary.expect('/kitchen-stations', 'POST', {
      locationId,
      requestKey: randomUUID(),
      code: 'AAA',
      name: 'Stație fără tichete',
      sortOrder: 0,
    })
  ).station;
  await f.a.primary.expect(`/kitchen-stations/${unused.id}/archive`, 'POST', {
    locationId,
    version: 1,
    requestKey: randomUUID(),
  });
  const active = (
    await f.a.primary.expect('/kitchen-stations', 'POST', {
      locationId,
      requestKey: randomUUID(),
      code: 'ZZZ',
      name: 'Stație activă',
      sortOrder: 0,
    })
  ).station;
  const options = await f.cook.expect(`/kitchen/station-options?locationId=${locationId}&limit=1`);
  expect(options.stations).toEqual([
    { id: station.id, code: 'BAR', name: 'Bar de filtrat', status: 'ARCHIVED' },
  ]);
  expect(options.nextCursor).toBe(station.id);
  const more = await f.cook.expect(
    `/kitchen/station-options?locationId=${locationId}&limit=1&cursor=${options.nextCursor}`,
  );
  expect(more.stations.map((entry: { id: string }) => entry.id)).toEqual([active.id]);
  expect(more.nextCursor).toBeNull();
  expect(
    (await f.cook.call(`/kitchen/station-options?locationId=${f.otherLocation.id}`)).status,
  ).toBe(403);
  expect(
    (
      await f.b.primary.call(
        `/kitchen/station-options?locationId=${f.b.location.id}&cursor=${station.id}`,
      )
    ).status,
  ).toBe(400);
  expect((await f.cook.expect(`${base}&status=READY`)).tickets[0].id).toBe(mixed.id);
  expect(
    (
      await f.a.primary.call(
        `/kitchen/tickets?locationId=${f.otherLocation.id}&stationId=${station.id}`,
      )
    ).status,
  ).toBe(404);
  expect(
    (
      await f.b.primary.call(
        `/kitchen/tickets?locationId=${f.b.location.id}&stationId=${station.id}`,
      )
    ).status,
  ).toBe(404);
  expect(
    (await f.cook.call(`/kitchen/tickets?locationId=${f.otherLocation.id}&stationId=UNASSIGNED`))
      .status,
  ).toBe(403);
  expect(
    (await f.cook.call(`/kitchen/tickets?locationId=${locationId}&stationId=invalid`)).status,
  ).toBe(400);
});
