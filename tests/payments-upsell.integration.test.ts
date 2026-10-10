import { completePacking } from './api/complete-packing';
import { randomUUID } from 'node:crypto';
import { beforeAll, afterAll, expect, it } from 'vitest';
import { closeOperations, prepareOperations } from './api/operations-setup';
import type { OperationsFixture } from './api/operations.types';

let f: OperationsFixture;
beforeAll(async () => {
  f = await prepareOperations();
});
afterAll(async () => {
  if (f) await closeOperations(f.owner.id);
});

it('attributes only net collected cents after completion, without multiplying offers by installments', async () => {
  const rule = (
    await f.manager.expect('/catalog/upsell-rules', 'POST', {
      requestKey: randomUUID(),
      locationId: f.a.location.id,
      sourceProductId: f.product.id,
      targetProductId: f.secondProduct.id,
      name: 'Recomandare cu plăți independente',
    })
  ).rule;
  const shown = (
    await f.worker.expect('/catalog/upsell-offers', 'POST', {
      requestKey: randomUUID(),
      locationId: f.a.location.id,
      ruleId: rule.id,
      ruleVersion: rule.version,
      productIds: [f.product.id],
    })
  ).offer;
  await f.worker.expect(`/catalog/upsell-offers/${shown.id}/accept`, 'POST', {});
  let order = (
    await f.worker.expect(
      '/orders',
      'POST',
      f.draft({
        items: [
          { productId: f.product.id, quantity: '1' },
          { productId: f.secondProduct.id, quantity: '2', sourceUpsellOfferId: shown.id },
        ],
      }),
    )
  ).order;
  const path = `/orders/${order.id}`;
  expect(order.total).toBe('20.51');
  order = (
    await f.worker.expect(`${path}/confirm`, 'POST', {
      version: order.version,
      requestKey: randomUUID(),
    })
  ).order;
  order = (
    await f.a.primary.expect(`${path}/payments`, 'POST', {
      version: order.version,
      requestKey: randomUUID(),
      cashShiftId: (await f.cashShift()).id,
      confirmed: true,
      payments: [
        { method: 'CASH', amount: '2', receivedAmount: '2' },
        { method: 'CARD', amount: '3' },
      ],
    })
  ).order;
  const metrics = async () =>
    (
      await f.a.primary.expect(
        `/catalog/upsell-metrics?${new URLSearchParams({
          locationId: f.a.location.id,
          ruleIds: rule.id,
          from: new Date(Date.now() - 86400000).toISOString(),
          to: new Date(Date.now() + 1000).toISOString(),
        })}`,
      )
    ).metrics[0];
  expect(await metrics()).toMatchObject({ shown: '1', accepted: '1', revenue: '0.00' });
  const sent = await f.worker.expect(`${path}/send`, 'POST', {
    version: order.version,
    requestKey: randomUUID(),
  });
  for (const [index, status] of ['PREPARING', 'READY'].entries())
    await f.cook.expect(`/kitchen/tickets/${sent.ticket.id}`, 'PATCH', {
      version: index + 1,
      status,
    });
  order = await completePacking(f.a.primary, order.id);
  order = (
    await f.a.primary.expect(`${path}/complete`, 'POST', {
      version: order.version,
      requestKey: randomUUID(),
    })
  ).order;
  // Prefix receives 244 cents; the attributed second line receives the remaining 256.
  expect(await metrics()).toMatchObject({ shown: '1', accepted: '1', revenue: '2.56' });
  let ledger = await f.a.primary.expect(`${path}/payments`);
  const cash = ledger.payments.find((p: { method: string }) => p.method === 'CASH');
  order = (
    await f.a.primary.expect(`${path}/refunds`, 'POST', {
      version: order.version,
      requestKey: randomUUID(),
      cashShiftId: (await f.cashShift()).id,
      confirmed: true,
      reason: 'Restituire parțială',
      refunds: [{ paymentId: cash.id, amount: '1' }],
    })
  ).order;
  expect(await metrics()).toMatchObject({ shown: '1', revenue: '2.05' });
  ledger = await f.a.primary.expect(`${path}/payments`);
  order = (
    await f.a.primary.expect(`${path}/refunds`, 'POST', {
      version: order.version,
      requestKey: randomUUID(),
      cashShiftId: (await f.cashShift()).id,
      confirmed: true,
      reason: 'Restituirea soldului',
      refunds: ledger.payments.map((p: { id: string; refundableAmount: string }) => ({
        paymentId: p.id,
        amount: p.refundableAmount,
      })),
    })
  ).order;
  expect(await metrics()).toMatchObject({ shown: '1', accepted: '1', revenue: '0.00' });
  await f.a.primary.expect(`${path}/payments`, 'POST', {
    version: order.version,
    requestKey: randomUUID(),
    cashShiftId: (await f.cashShift()).id,
    confirmed: true,
    payments: [{ method: 'CARD', amount: '0.01' }],
  });
  expect(await metrics()).toMatchObject({ shown: '1', revenue: '0.01' });
});

it('keeps a large cash tender and its change exact beyond safe Number precision', async () => {
  let order = (await f.worker.expect('/orders', 'POST', f.draft())).order;
  order = (
    await f.worker.expect(`/orders/${order.id}/confirm`, 'POST', {
      version: order.version,
      requestKey: randomUUID(),
    })
  ).order;
  await f.a.primary.expect(`/orders/${order.id}/payments`, 'POST', {
    version: order.version,
    requestKey: randomUUID(),
    cashShiftId: (await f.cashShift()).id,
    confirmed: true,
    payments: [{ method: 'CASH', amount: '0.01', receivedAmount: '9007199254740993.01' }],
  });
  const ledger = await f.a.primary.expect(`/orders/${order.id}/payments`);
  expect(ledger.payments[0]).toMatchObject({
    amount: '0.01',
    receivedAmount: '9007199254740993.01',
    changeAmount: '9007199254740993.00',
  });
});
