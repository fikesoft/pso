import { randomUUID } from 'node:crypto';
import { expect } from 'vitest';
import { db, noSecrets } from './support/harness';
import type { CheckoutFixture } from './checkout.types';
import { renameCheckoutCompany } from './checkout-snapshot-fixture';

export async function verifyDemoCheckout(f: CheckoutFixture) {
  const order = await f.makeOrder();
  const worker = await f.login('waiter');
  const request = { version: order.version, requestKey: randomUUID() };
  const responses = await Promise.all([
    worker.expect(`/orders/${order.id}/checkout/demo`, 'POST', request),
    worker.expect(`/orders/${order.id}/checkout/demo`, 'POST', request),
  ]);
  expect(responses[0].receipt).toEqual(responses[1].receipt);
  expect(responses[0].order).toMatchObject({
    status: 'COMPLETED',
    version: order.version + 1,
    checkout: { mode: 'DEMO', total: '10.01' },
  });
  expect(responses[0].receipt).toMatchObject({
    mode: 'DEMO',
    method: null,
    total: '10.01',
    paymentId: null,
    isFiscal: false,
    receivedAmount: null,
    changeAmount: null,
  });
  expect(responses[0].receipt.number).toBe(`DEMO-${order.number}`);
  expect((await worker.expect(`/orders/${order.id}/receipt`)).receipt).toEqual(
    responses[0].receipt,
  );
  const stored = await f.stored(order.id);
  expect(stored.checkouts).toHaveLength(1);
  expect(stored.payments).toHaveLength(0);
  expect(stored.events).toHaveLength(1);
  expect(stored.audits).toHaveLength(1);
  expect(
    (
      await worker.call(`/orders/${order.id}/checkout/demo`, 'POST', {
        ...request,
        version: order.version + 1,
      })
    ).status,
  ).toBe(409);
  noSecrets(responses[0]);
}

export async function verifyManualCheckout(f: CheckoutFixture) {
  const order = await f.makeOrder();
  const cashier = await f.login('cashier');
  const request = {
    version: order.version,
    requestKey: randomUUID(),
    method: 'CASH',
    receivedAmount: '20.00',
    cashShiftId: (await f.cashShift(cashier)).id,
    confirmed: true,
  };
  const responses = await Promise.all([
    cashier.expect(`/orders/${order.id}/checkout/manual`, 'POST', request),
    cashier.expect(`/orders/${order.id}/checkout/manual`, 'POST', request),
  ]);
  expect(responses[0].receipt).toEqual(responses[1].receipt);
  expect(responses[0].receipt).toMatchObject({
    mode: 'MANUAL',
    method: 'CASH',
    total: '10.01',
    receivedAmount: '20.00',
    changeAmount: '9.99',
    isFiscal: false,
  });
  expect(responses[0].receipt.paymentId).toMatch(/^[a-f\d-]{36}$/);
  expect(responses[0].order.checkout).toMatchObject({
    mode: 'MANUAL',
    method: 'CASH',
    total: '10.01',
  });
  const stored = await f.stored(order.id);
  expect(stored.checkouts).toHaveLength(1);
  expect(stored.payments).toHaveLength(1);
  expect(stored.events).toHaveLength(1);
  expect(stored.audits).toHaveLength(1);
  expect(String(stored.payments[0]!.amount)).toBe('10.01');
  expect(stored.payments[0]).toMatchObject({ origin: 'MANUAL', method: 'CASH' });
  expect(
    (
      await cashier.call(`/orders/${order.id}/checkout/manual`, 'POST', {
        ...request,
        receivedAmount: '30.00',
      })
    ).status,
  ).toBe(409);
  const equivalent = await cashier.expect(`/orders/${order.id}/checkout/manual`, 'POST', {
    ...request,
    receivedAmount: '20',
  });
  expect(equivalent.receipt.id).toBe(responses[0].receipt.id);
  noSecrets(responses[0]);
}

export async function verifyCardAndZero(f: CheckoutFixture) {
  const cashier = await f.login('cashier');
  const card = await f.makeOrder();
  const result = await cashier.expect(`/orders/${card.id}/checkout/manual`, 'POST', {
    version: card.version,
    requestKey: randomUUID(),
    method: 'CARD',
    cashShiftId: (await f.cashShift(cashier)).id,
    confirmed: true,
  });
  expect(result.receipt).toMatchObject({
    method: 'CARD',
    receivedAmount: '10.01',
    changeAmount: '0.00',
  });
  const free = (
    await f.a.primary.expect('/catalog/products', 'POST', {
      locationId: f.a.location.id,
      name: 'Produs gratuit',
      sku: 'FREE',
      price: '0',
    })
  ).product;
  const zero = await f.makeOrder({ items: [{ productId: free.id, quantity: '1' }] });
  const empty = await cashier.expect(`/orders/${zero.id}/checkout/manual`, 'POST', {
    version: zero.version,
    requestKey: randomUUID(),
    method: 'CASH',
    receivedAmount: '0',
    cashShiftId: (await f.cashShift(cashier)).id,
    confirmed: true,
  });
  expect(empty.receipt).toMatchObject({
    total: '0.00',
    receivedAmount: '0.00',
    changeAmount: '0.00',
  });
  expect((await f.stored(zero.id)).payments).toHaveLength(1);
}

export async function verifyReceiptSnapshot(f: CheckoutFixture) {
  const cashier = await f.login('cashier');
  const order = await f.makeOrder();
  const result = await cashier.expect(`/orders/${order.id}/checkout/manual`, 'POST', {
    version: order.version,
    requestKey: randomUUID(),
    method: 'CARD',
    cashShiftId: (await f.cashShift(cashier)).id,
    confirmed: true,
  });
  const currentProduct = (
    await f.a.primary.expect(`/catalog?locationId=${f.a.location.id}`)
  ).products.find((item: any) => item.id === f.product.id);
  await f.a.primary.expect(`/catalog/products/${f.product.id}`, 'PATCH', {
    version: currentProduct.version,
    name: 'Denumire ulterioară',
  });
  await renameCheckoutCompany(f.a.company.organization.id);
  await db.withTenantTransaction(
    db.runtime,
    { organizationId: f.a.company.organization.id },
    async (tx) => {
      await tx.location.update({
        where: { id: f.a.location.id },
        data: { name: 'Locație redenumită', version: { increment: 1 } },
      });
      await tx.companyUser.update({
        where: { id: f.actors.cashier.user.id },
        data: { displayName: 'Casier redenumit', version: { increment: 1 } },
      });
    },
  );
  const saved = await cashier.expect(`/orders/${order.id}/receipt`);
  expect(saved.receipt).toEqual(result.receipt);
  expect(saved.receipt.items[0]).toMatchObject({
    productName: 'Cafea inițială',
    unitPrice: '10.0050',
    lineTotal: '10.01',
  });
}
