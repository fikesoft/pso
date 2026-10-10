import { completePacking } from './api/complete-packing';
import { randomUUID } from 'node:crypto';
import { beforeAll, afterAll, expect, it } from 'vitest';
import { prepareOrderLifecycle } from './api/order-lifecycle-setup';
import type { OrderLifecycleFixture } from './api/order-lifecycle.types';
import { closeOperations } from './api/operations-setup';
import { BrowserSession, fixturePasswords } from './api/support/harness';

let f: OrderLifecycleFixture;
beforeAll(async () => {
  f = await prepareOrderLifecycle();
});
afterAll(async () => {
  if (f) await closeOperations(f.owner.id);
});
async function ready() {
  const draft = await f.create();
  const sent = await f.send(draft.id);
  for (const [index, status] of ['PREPARING', 'READY'].entries())
    await f.a.primary.expect(`/kitchen/tickets/${sent.ticket.id}`, 'PATCH', {
      version: index + 1,
      status,
    });
  return completePacking(f.a.primary, draft.id);
}

it('enforces PIN delegation, transaction amount limits, location and current DENY during replay', async () => {
  const order = await ready();
  await f.a.primary.expect(`/orders/${order.id}/complete`, 'POST', {
    version: order.version,
    requestKey: randomUUID(),
  });
  const completion = (await f.stored(order.id)).events.find(
    (event) => event.kind === 'ORDER' && event.toStatus === 'COMPLETED',
  )!;
  const role = (
    await f.a.primary.expect('/roles', 'POST', {
      name: 'Casier PIN limitat',
      permissions: [
        { permission: 'orders.read' },
        ...['cash.registers.read', 'cash.shifts.read', 'cash.shifts.open'].map((permission) => ({
          permission,
        })),
        { permission: 'payments.collect', limits: { maxAmount: '10' } },
        { permission: 'payments.refund', limits: { maxAmount: '3' } },
      ],
    })
  ).role;
  const created = await f.a.primary.expect('/staff', 'POST', {
    login: 'casier-pin',
    displayName: 'Casier sintetic PIN',
    authenticationMethod: 'PIN',
    locationIds: [f.a.location.id],
    assignments: [
      { roleVersionId: role.versions[0].id, scopeType: 'LOCATION', locationId: f.a.location.id },
    ],
  });
  fixturePasswords.add(created.pin);
  const login = async () => {
    const session = new BrowserSession('TENANT');
    await session.expect('/auth/session');
    await session.expect('/auth/pin', 'POST', {
      companySlug: f.a.company.organization.slug,
      pin: created.pin,
    });
    return session;
  };
  const actor = await login();
  const current = await f.current(order.id);
  const body = {
    version: current.version,
    requestKey: randomUUID(),
    cashShiftId: (await f.cashShift(actor)).id,
    confirmed: true,
    payments: [{ method: 'CARD', amount: '5' }],
  };
  const path = `/orders/${order.id}`;
  expect(
    (
      await actor.call(`${path}/payments`, 'POST', {
        ...body,
        payments: [{ method: 'CARD', amount: '10.01' }],
      })
    ).status,
  ).toBe(403);
  const paid = await actor.expect(`${path}/payments`, 'POST', body);
  expect(paid.order).toMatchObject({ status: 'COMPLETED', paymentStatus: 'PARTIALLY_PAID' });
  expect(paid.operation.actorUserId).toBe(created.user.id);
  const payment = (await actor.expect(`${path}/payments`)).payments[0];
  const refundBody = {
    version: paid.order.version,
    requestKey: randomUUID(),
    cashShiftId: (await f.cashShift(actor)).id,
    confirmed: true,
    reason: 'Restituire PIN autorizată',
    refunds: [{ paymentId: payment.id, amount: '2' }],
  };
  expect(
    (
      await actor.call(`${path}/refunds`, 'POST', {
        ...refundBody,
        refunds: [{ paymentId: payment.id, amount: '3.01' }],
      })
    ).status,
  ).toBe(403);
  await actor.expect(`${path}/refunds`, 'POST', refundBody);
  expect((await f.stored(order.id)).events.find((event) => event.id === completion.id)).toEqual(
    completion,
  );
  const otherProduct = (
    await f.a.primary.expect('/catalog/products', 'POST', {
      locationId: f.otherLocation.id,
      name: 'Alt produs',
      sku: randomUUID(),
      price: '5',
    })
  ).product;
  const other = (
    await f.a.primary.expect(
      '/orders',
      'POST',
      f.draft({
        locationId: f.otherLocation.id,
        items: [{ productId: otherProduct.id, quantity: '1' }],
      }),
    )
  ).order;
  expect(
    (
      await actor.call(`/orders/${other.id}/payments`, 'POST', {
        ...body,
        version: 1,
        requestKey: randomUUID(),
      })
    ).status,
  ).toBe(403);
  expect((await actor.call(`/orders/${other.id}/payments`)).status).toBe(403);
  await f.a.primary.expect(`/staff/${created.user.id}/overrides`, 'POST', {
    permission: 'payments.collect',
    effect: 'DENY',
    scopeType: 'ORGANIZATION',
  });
  const denied = await login();
  expect((await denied.call(`${path}/payments`, 'POST', body)).status).toBe(403);
  expect((await f.stored(order.id)).payments).toBe(1);
});

it('keeps the old receipt immutable through partial refund and recollection', async () => {
  const order = await ready();
  const old = await f.a.primary.expect(`/orders/${order.id}/checkout/manual`, 'POST', {
    version: order.version,
    requestKey: randomUUID(),
    cashShiftId: (await f.cashShift()).id,
    confirmed: true,
    method: 'CASH',
    receivedAmount: '30',
  });
  const path = `/orders/${order.id}`;
  const original = await f.a.primary.expect(`${path}/receipt`);
  const body = {
    version: old.order.version,
    requestKey: randomUUID(),
    cashShiftId: (await f.cashShift()).id,
    confirmed: true,
    reason: 'Rambursare parțială bon vechi',
    refunds: [{ paymentId: original.receipt.paymentId, amount: '5.01' }],
  };
  const [a, b] = await Promise.all([
    f.a.primary.expect(`${path}/refunds`, 'POST', body),
    f.a.primary.expect(`${path}/refunds`, 'POST', body),
  ]);
  expect(a).toEqual(b);
  expect(a.order).toMatchObject({
    status: 'COMPLETED',
    paymentStatus: 'PARTIALLY_REFUNDED',
    paymentSummary: { netPaidAmount: '15.00' },
  });
  const restored = await f.a.primary.expect(`${path}/payments`, 'POST', {
    version: a.order.version,
    requestKey: randomUUID(),
    cashShiftId: (await f.cashShift()).id,
    confirmed: true,
    payments: [{ method: 'CARD', amount: '5.01' }],
  });
  expect(restored.order.paymentStatus).toBe('PAID');
  expect(await f.a.primary.expect(`${path}/receipt`)).toEqual(original);
  const history = await f.a.primary.expect(`${path}/payments`);
  expect(
    history.payments.find((payment: { checkoutId: string | null }) => payment.checkoutId),
  ).toMatchObject({ receivedAmount: '30.00', changeAmount: '9.99', refundedAmount: '5.01' });
  expect((await f.stored(order.id)).documents).toBe(1);
});

it('zero totals carry no receivable and DEMO remains excluded from collections', async () => {
  const order = await ready();
  const demo = await f.a.primary.expect(`/orders/${order.id}/checkout/demo`, 'POST', {
    version: order.version,
    requestKey: randomUUID(),
  });
  expect(demo.order.paymentSummary).toMatchObject({
    status: 'UNPAID',
    collectedAmount: '0.00',
    outstandingAmount: '0.00',
  });
  expect(
    (
      await f.a.primary.call(`/orders/${order.id}/payments`, 'POST', {
        version: demo.order.version,
        requestKey: randomUUID(),
        cashShiftId: (await f.cashShift()).id,
        confirmed: true,
        payments: [{ method: 'CARD', amount: '1' }],
      })
    ).status,
  ).toBe(409);
  const product = (
    await f.a.primary.expect('/catalog/products', 'POST', {
      locationId: f.a.location.id,
      name: 'Produs gratuit',
      sku: randomUUID(),
      price: '0',
    })
  ).product;
  const free = (
    await f.a.primary.expect(
      '/orders',
      'POST',
      f.draft({ items: [{ productId: product.id, quantity: '1' }] }),
    )
  ).order;
  expect(free.paymentSummary).toMatchObject({
    status: 'PAID',
    collectedAmount: '0.00',
    outstandingAmount: '0.00',
  });
  expect((await f.stored(free.id)).payments).toBe(0);
});
