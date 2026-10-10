import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { prepareOperations, closeOperations } from './api/operations-setup';
let f: Awaited<ReturnType<typeof prepareOperations>>;
beforeAll(async () => {
  f = await prepareOperations();
}, 60_000);
afterAll(async () => {
  if (f) await closeOperations(f.owner.id);
});

it('sosirile cresc numai la generare, nu la ciornă, retry, progres sau anulare', async () => {
  const path = `/kitchen/arrivals?locationId=${f.a.location.id}`;
  expect(await f.cook.expect(path)).toEqual({ revision: '0' });
  const { order } = await f.a.primary.expect('/orders', 'POST', f.draft());
  expect(await f.cook.expect(path)).toEqual({ revision: '0' });
  const command = { version: order.version, requestKey: randomUUID() };
  const { ticket } = await f.a.primary.expect(`/orders/${order.id}/send`, 'POST', command);
  expect(await f.cook.expect(path)).toEqual({ revision: '1' });
  await f.a.primary.expect(`/orders/${order.id}/send`, 'POST', command);
  await f.cook.expect(`/kitchen/tickets/${ticket.id}`, 'PATCH', {
    version: 1,
    status: 'PREPARING',
  });
  const current = (await f.a.primary.expect(`/orders/${order.id}`)).order;
  await f.a.primary.expect(`/orders/${order.id}/cancel`, 'POST', {
    version: current.version,
    requestKey: randomUUID(),
    reason: 'Anulare sintetică sosiri',
  });
  expect(await f.cook.expect(path)).toEqual({ revision: '1' });
  expect((await f.cook.expect(`/kitchen/tickets?locationId=${f.a.location.id}`)).tickets).toEqual(
    [],
  );
});

it('sosirile sunt independente de prima pagină și respectă stația selectată', async () => {
  const locationId = f.a.location.id;
  const { station } = await f.a.primary.expect('/kitchen-stations', 'POST', {
    locationId,
    requestKey: randomUUID(),
    code: 'ARRIVAL',
    name: 'Stație sosiri',
    sortOrder: 0,
  });
  await f.a.primary.expect('/kitchen-routing', 'PUT', {
    locationId,
    productId: f.product.id,
    stationId: station.id,
    version: 0,
    requestKey: randomUUID(),
  });
  const assigned = `/kitchen/arrivals?locationId=${locationId}&stationId=${station.id}`;
  const unassigned = `/kitchen/arrivals?locationId=${locationId}&stationId=UNASSIGNED`;
  expect(await f.cook.expect(assigned)).toEqual({ revision: '0' });
  const before = await f.cook.expect(unassigned);
  for (let index = 0; index < 51; index++) {
    const { order } = await f.a.primary.expect(
      '/orders',
      'POST',
      f.draft({
        items: [{ productId: f.product.id, quantity: '1' }],
      }),
    );
    await f.a.primary.expect(`/orders/${order.id}/send`, 'POST', {
      version: order.version,
      requestKey: randomUUID(),
    });
  }
  expect(
    (await f.cook.expect(`/kitchen/tickets?locationId=${locationId}&stationId=${station.id}`))
      .tickets,
  ).toHaveLength(50);
  expect(await f.cook.expect(assigned)).toEqual({ revision: '51' });
  expect(await f.cook.expect(unassigned)).toEqual(before);
});

it('sosirile cer kitchen.read și nu divulgă altă companie, locație sau stație', async () => {
  const path = `/kitchen/arrivals?locationId=${f.a.location.id}`;
  expect((await f.manager.call(path)).status).toBe(403);
  expect((await f.cook.call(`/kitchen/arrivals?locationId=${f.otherLocation.id}`)).status).toBe(
    403,
  );
  expect((await f.b.primary.call(path)).status).toBe(403);
  expect((await f.cook.call(`${path}&stationId=${randomUUID()}`)).status).toBe(404);
  expect((await f.cook.call(`${path}&limit=1000`)).status).toBe(400);
  expect(await f.b.primary.expect(`/kitchen/arrivals?locationId=${f.b.location.id}`)).toEqual({
    revision: '0',
  });
});
