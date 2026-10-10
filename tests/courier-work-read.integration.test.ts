import { randomUUID } from 'node:crypto';
import { beforeAll, afterAll, expect, it } from 'vitest';
import { prepareCouriers } from './api/courier-setup';
import { closeOperations } from './api/operations-setup';
import { noSecrets } from './api/support/harness';
let f: Awaited<ReturnType<typeof prepareCouriers>>;
let assigned: string[], other: string;
beforeAll(async () => {
  f = await prepareCouriers();
  for (const user of [f.own, f.second]) {
    const id = randomUUID();
    await f.a.primary.expect(`/couriers/${id}/commands`, 'POST', {
      ...f.body(user.user.id),
      profile: { vehicle: 'BICYCLE', capacity: 20 },
    });
    await f.a.primary.expect(`/couriers/${id}/commands`, 'POST', {
      action: 'SET_AVAILABILITY',
      version: 1,
      locationId: f.a.location.id,
      requestKey: randomUUID(),
      availability: 'AVAILABLE',
    });
  }
  const create = async (userId: string, quantity = '2') => {
    let order = (
      await f.a.primary.expect(
        '/orders',
        'POST',
        f.draft({
          serviceType: 'DELIVERY',
          tableLabel: undefined,
          customer: { name: 'Client curier sintetic', phone: '+37360000000' },
          deliveryAddress: { address: 'Destinație sintetică', instructions: 'Intrarea laterală' },
          items: [{ productId: f.secondProduct.id, quantity }],
        }),
      )
    ).order;
    order = (
      await f.a.primary.expect(`/orders/${order.id}/confirm`, 'POST', {
        version: order.version,
        requestKey: randomUUID(),
      })
    ).order;
    await f.a.primary.expect(`/orders/${order.id}/delivery`, 'POST', {
      version: order.version,
      requestKey: randomUUID(),
      status: 'ASSIGNED',
      courierUserId: userId,
    });
    return order.id as string;
  };
  assigned = [
    await create(f.own.user.id),
    await create(f.own.user.id),
    await create(f.own.user.id, '20'),
  ];
  other = await create(f.second.user.id);
});
afterAll(async () => {
  if (f) await closeOperations(f.owner.id);
});
const list = (suffix = '') => `/courier-work?locationId=${f.a.location.id}${suffix}`;
const detail = (id: string) => `/courier-work/${id}?locationId=${f.a.location.id}`;
it('courier work: own assignments only, private details and authenticated pagination', async () => {
  const own = await f.login(),
    second = await f.login(f.second);
  const response = await own.call(list('&limit=1'));
  expect(response.headers.get('cache-control')).toBe('no-store');
  expect(response.status).toBe(200);
  noSecrets(response.data);
  expect(response.data.orders).toHaveLength(1);
  expect(response.data.orders[0].courierUserId).toBe(f.own.user.id);
  const cursor = encodeURIComponent(response.data.nextCursor);
  const next = await own.expect(list(`&limit=1&cursor=${cursor}`));
  expect(next.orders).toHaveLength(1);
  expect(next.orders[0].orderId).not.toBe(response.data.orders[0].orderId);
  expect((await second.call(list(`&cursor=${cursor}`))).status).toBe(400);
  expect((await own.call(list(`&view=HISTORY&cursor=${cursor}`))).status).toBe(400);
  expect((await own.call(list(`&cursor=${randomUUID()}`))).status).toBe(400);
  expect((await own.call(list(`&userId=${f.second.user.id}`))).status).toBe(400);
  const record = (await own.expect(detail(assigned[0]!))).order;
  expect(record).toMatchObject({
    orderId: assigned[0],
    customer: { name: 'Client curier sintetic' },
    deliveryAddress: { address: 'Destinație sintetică' },
    total: '10.50',
    outstandingAmount: '10.50',
  });
  expect((await own.call(detail(other))).status).toBe(404);
  expect((await own.call(`/courier-work?locationId=${f.otherLocation.id}`)).status).toBe(403);
  expect((await (await f.login(f.reader)).call(list())).status).toBe(403);
  expect((await f.a.primary.call(list())).status).toBe(403);
  expect((await f.b.primary.call(detail(assigned[0]!))).status).toBe(403);
});
it('courier work: failed delivery moves to history and reassignment removes access', async () => {
  const own = await f.login();
  const id = assigned[0]!,
    current = (await f.a.primary.expect(`/orders/${id}`)).order;
  await own.expect(`/orders/${id}/delivery`, 'POST', {
    version: current.version,
    requestKey: randomUUID(),
    status: 'FAILED',
    reason: 'Client indisponibil',
  });
  expect(
    (await own.expect(list())).orders.map((order: { orderId: string }) => order.orderId),
  ).not.toContain(id);
  expect(
    (await own.expect(list('&view=HISTORY'))).orders.map(
      (order: { orderId: string }) => order.orderId,
    ),
  ).toEqual([id]);
  const reassignId = assigned[1]!,
    previous = (await f.a.primary.expect(`/orders/${reassignId}`)).order;
  await f.a.primary.expect(`/orders/${reassignId}/delivery`, 'POST', {
    version: previous.version,
    requestKey: randomUUID(),
    status: 'ASSIGNED',
    courierUserId: f.second.user.id,
    reason: 'Schimb de tură',
  });
  expect((await own.call(detail(reassignId))).status).toBe(404);
  const second = await f.login(f.second);
  expect((await second.expect(detail(reassignId))).order.courierUserId).toBe(f.second.user.id);
});
it('courier work: amount limits and actual DENY are reevaluated for history and active orders', async () => {
  const { users } = await f.a.primary.expect('/staff');
  const user = users.find((entry: { id: string }) => entry.id === f.own.user.id);
  for (const assignment of user.assignments)
    await f.a.primary.expect(`/staff/${f.own.user.id}/assignments/${assignment.id}`, 'DELETE', {});
  const { role } = await f.a.primary.expect('/roles', 'POST', {
    name: 'Curier cu plafon de citire',
    permissions: [
      { permission: 'orders.read', limits: { maxAmount: '20.00' } },
      { permission: 'delivery.update' },
    ],
  });
  await f.a.primary.expect(`/staff/${f.own.user.id}/assignments`, 'POST', {
    roleVersionId: role.versions[0].id,
    scopeType: 'LOCATION',
    locationId: f.a.location.id,
  });
  let own = await f.login();
  expect((await own.expect(list())).orders).toHaveLength(0);
  expect((await own.call(detail(assigned[2]!))).status).toBe(403);
  expect((await own.expect(list('&view=HISTORY'))).orders).toHaveLength(1);
  await f.a.primary.expect(`/staff/${f.own.user.id}/overrides`, 'POST', {
    permission: 'delivery.update',
    effect: 'DENY',
    scopeType: 'LOCATION',
    locationId: f.a.location.id,
  });
  own = await f.login();
  expect((await own.call(list('&view=HISTORY'))).status).toBe(403);
  expect((await own.call(detail(assigned[0]!))).status).toBe(403);
});
