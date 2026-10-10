import { beforeAll, afterAll, expect, it } from 'vitest';
import { prepareOperations, closeOperations } from './api/operations-setup';
import type { OperationsFixture } from './api/operations.types';
import { activate, BrowserSession } from './api/support/harness';

let fixture: OperationsFixture;
let limited: BrowserSession;

beforeAll(async () => {
  fixture = await prepareOperations();
  const role = (
    await fixture.a.primary.expect('/roles', 'POST', {
      name: 'Comenzi plafonate la 10 MDL',
      permissions: [
        { permission: 'orders.create', limits: { maxAmount: '10.00' } },
        { permission: 'orders.read' },
      ],
    })
  ).role;
  const worker = await fixture.a.primary.expect('/staff', 'POST', {
    login: 'plafon-comenzi',
    displayName: 'Chelner cu plafon sintetic',
    locationIds: [fixture.a.location.id],
    assignments: [
      {
        roleVersionId: role.versions[0].id,
        scopeType: 'LOCATION',
        locationId: fixture.a.location.id,
      },
    ],
  });
  limited = new BrowserSession('TENANT');
  await activate(
    limited,
    'plafon-comenzi',
    worker.temporaryPassword,
    fixture.a.company.organization.slug,
  );
});
afterAll(async () => {
  if (fixture) await closeOperations(fixture.owner.id);
});

it('enforces the exact rounded total at creation, including the maximum boundary', async () => {
  const above = fixture.draft({ items: [{ productId: fixture.product.id, quantity: '1' }] });
  expect((await limited.call('/orders', 'POST', above)).status).toBe(403);
  expect((await limited.expect(`/orders?locationId=${fixture.a.location.id}`)).orders).toEqual([]);
  await fixture.a.primary.expect(
    `/catalog/products/${fixture.product.id}/locations/${fixture.a.location.id}`,
    'PUT',
    { version: 1, price: '9.9950', enabled: true },
  );
  const allowed = (
    await limited.expect(
      '/orders',
      'POST',
      fixture.draft({
        items: [{ productId: fixture.product.id, quantity: '1' }],
      }),
    )
  ).order;
  expect(allowed.total).toBe('10.00');
  expect(allowed.items[0].unitPrice).toBe('9.9950');
});

it('rejects edits above the ceiling without changing the draft, its items or version', async () => {
  const order = (
    await limited.expect(
      '/orders',
      'POST',
      fixture.draft({
        items: [{ productId: fixture.secondProduct.id, quantity: '1' }],
      }),
    )
  ).order;
  const rejected = await limited.call(`/orders/${order.id}`, 'PATCH', {
    version: 1,
    serviceType: 'TAKEAWAY',
    items: [{ id: order.items[0].id, productId: fixture.secondProduct.id, quantity: '2' }],
  });
  expect(rejected.status).toBe(403);
  expect((await limited.expect(`/orders/${order.id}`)).order).toMatchObject({
    total: '5.25',
    version: 1,
    serviceType: 'DINE_IN',
    items: [{ id: order.items[0].id, quantity: '1.000', lineTotal: '5.25' }],
  });
  await limited.expect(`/orders/${order.id}/cancel`, 'POST', { version: 1 });
  expect((await limited.expect(`/orders/${order.id}`)).order.status).toBe('CANCELLED');
});

it('checks existing order amounts for edit, send and cancel and allows a bounded send', async () => {
  const request = fixture.draft({
    items: [{ productId: fixture.secondProduct.id, quantity: '3' }],
  });
  const order = (await fixture.a.primary.expect('/orders', 'POST', request)).order;
  expect(order.total).toBe('15.75');
  expect((await limited.call('/orders', 'POST', request)).status).toBe(403);
  expect(
    (
      await limited.call(`/orders/${order.id}`, 'PATCH', {
        version: 1,
        serviceType: 'TAKEAWAY',
        items: [{ id: order.items[0].id, productId: fixture.secondProduct.id, quantity: '1' }],
      })
    ).status,
  ).toBe(403);
  expect(
    (
      await limited.call(`/orders/${order.id}/send`, 'POST', {
        version: 1,
        requestKey: request.requestKey,
      })
    ).status,
  ).toBe(403);
  expect((await limited.call(`/orders/${order.id}/cancel`, 'POST', { version: 1 })).status).toBe(
    403,
  );
  expect((await fixture.a.primary.expect(`/orders/${order.id}`)).order).toMatchObject({
    total: '15.75',
    status: 'DRAFT',
    version: 1,
    kitchenStatus: 'NOT_SENT',
  });
  const boundedRequest = fixture.draft({
    items: [{ productId: fixture.secondProduct.id, quantity: '1' }],
  });
  const bounded = (await limited.expect('/orders', 'POST', boundedRequest)).order;
  const sent = await limited.expect(`/orders/${bounded.id}/send`, 'POST', {
    version: 1,
    requestKey: boundedRequest.requestKey,
  });
  expect(sent.order).toMatchObject({ total: '5.25', status: 'CONFIRMED', version: 2 });
});
