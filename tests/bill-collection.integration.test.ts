import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { prepareTables } from './api/tables-setup';
import type { TablesFixture } from './api/tables.types';
import { closeOperations } from './api/operations-setup';
let f: TablesFixture;
beforeAll(async () => {
  f = await prepareTables(true);
}, 60_000);
afterAll(async () => {
  if (f) await closeOperations(f.owner.id);
});
async function splitVisit() {
  const visit = (await f.open((await f.table()).table.id)).event.result;
  for (let i = 0; i < 2; i++) {
    const { order } = await f.linked(visit.id, '10.01');
    await f.orderAction(order.id, 'send');
  }
  const request = {
    locationId: f.locationId,
    context: { kind: 'VISIT', id: visit.id },
    division: { mode: 'EQUAL', count: 3 },
  };
  const { preview } = await f.a.primary.expect('/bill-splits/preview', 'POST', request);
  return (
    await f.a.primary.expect('/bill-splits', 'POST', {
      ...request,
      requestKey: randomUUID(),
      confirmed: true,
      visitVersion: preview.visitVersion,
      sources: preview.sources.map(
        ({ orderId, version }: { orderId: string; version: number }) => ({ orderId, version }),
      ),
    })
  ).split;
}
async function paymentBody(partId: string) {
  const { preview } = await f.a.primary.expect(
    `/bill-parts/${partId}/payment-preview?locationId=${f.locationId}`,
  );
  return {
    locationId: f.locationId,
    requestKey: randomUUID(),
    cashShiftId: (await f.cashShift()).id,
    confirmed: true,
    amount: preview.outstandingAmount,
    payment: { method: 'CASH', receivedAmount: '10.00' },
    sources: preview.sources.map(({ orderId, version }: { orderId: string; version: number }) => ({
      orderId,
      version,
    })),
  };
}
it('încasează atomic partea pe două comenzi, păstrează restul exact și recuperează răspunsul', async () => {
  const split = await splitVisit(),
    part = split.parts[1];
  expect(part.allocations).toHaveLength(2);
  const body = await paymentBody(part.id),
    path = `/bill-parts/${part.id}/payments`;
  const result = await f.a.primary.expect(path, 'POST', body);
  expect(result.collection.operations).toHaveLength(2);
  expect(result.collection).toMatchObject({
    amount: '6.67',
    receivedAmount: '10.00',
    method: 'CASH',
  });
  expect(
    await f.a.primary.expect(path, 'POST', { ...body, sources: [...body.sources].reverse() }),
  ).toEqual(result);
  const resolved = await f.a.primary.expect(
    `/bill-parts/${part.id}/payment-commands/resolution`,
    'POST',
    { locationId: f.locationId, requestKey: body.requestKey },
  );
  expect(resolved).toMatchObject({ status: 'SUCCEEDED', result });
  expect(
    (await f.a.primary.call(path, 'POST', { ...body, payment: { method: 'CARD' } })).status,
  ).toBe(409);
  const current = (await f.a.primary.expect(`/bill-splits/${split.id}?locationId=${f.locationId}`))
    .split;
  expect(current.parts[1]).toMatchObject({ netPaidAmount: '6.67', outstandingAmount: '0.00' });
  expect(current.parts[0].outstandingAmount).toBe('6.68');
  let received = 0,
    change = 0;
  for (const source of body.sources) {
    const ledger = await f.a.primary.expect(`/orders/${source.orderId}/payments`);
    for (const payment of ledger.payments) {
      received += Math.round(Number(payment.receivedAmount) * 100);
      change += Math.round(Number(payment.changeAmount) * 100);
    }
  }
  expect(received).toBe(1000);
  expect(change).toBe(333);
});
it('retrage tentativa necunoscută, refuză plata întârziată și versiunile vechi', async () => {
  const split = await splitVisit(),
    part = split.parts[1];
  const body = await paymentBody(part.id),
    path = `/bill-parts/${part.id}/payments`;
  const identity = { locationId: f.locationId, requestKey: body.requestKey };
  expect(
    await f.a.primary.expect(
      `/bill-parts/${part.id}/payment-commands/resolution`,
      'POST',
      identity,
    ),
  ).toMatchObject({ status: 'RETIRED' });
  expect((await f.a.primary.call(path, 'POST', body)).status).toBe(409);
  expect(
    (
      await f.a.primary.call(path, 'POST', {
        ...body,
        requestKey: randomUUID(),
        sources: body.sources.map((source: { orderId: string; version: number }) => ({
          ...source,
          version: 1,
        })),
      })
    ).status,
  ).toBe(409);
  expect(
    (
      await f.a.primary.call(path, 'POST', {
        ...body,
        requestKey: randomUUID(),
        payment: { method: 'CASH', receivedAmount: '1.00' },
      })
    ).status,
  ).toBe(400);
  const valid = { ...body, requestKey: randomUUID(), payment: { method: 'CARD' } };
  expect((await f.a.primary.expect(path, 'POST', valid)).collection.method).toBe('CARD');
});
it('izolează tenantul, locația și dreptul de încasare', async () => {
  const split = await splitVisit(),
    part = split.parts[1],
    body = await paymentBody(part.id);
  const path = `/bill-parts/${part.id}/payments`;
  expect((await f.tableActors.splitter!.session.call(path, 'POST', body)).status).toBe(403);
  expect(
    (await f.b.primary.call(path, 'POST', { ...body, locationId: f.b.location.id })).status,
  ).toBe(404);
  expect(
    (await f.a.primary.call(path, 'POST', { ...body, locationId: f.otherLocation.id })).status,
  ).toBe(404);
});

it('plafonul de încasare se verifică pe întreaga parte, fără divulgarea surselor ascunse', async () => {
  const split = await splitVisit(),
    part = split.parts[1],
    body = await paymentBody(part.id);
  for (const name of ['collectionLimited', 'collectionHidden']) {
    const actor = f.tableActors[name]!.session;
    expect(
      (await actor.call(`/bill-parts/${part.id}/payment-preview?locationId=${f.locationId}`))
        .status,
    ).toBe(403);
    expect((await actor.call(`/bill-parts/${part.id}/payments`, 'POST', body)).status).toBe(403);
  }
});
it('rambursarea redeschide numai alocarea originală; replay nu o încasează din nou', async () => {
  const split = await splitVisit(),
    part = split.parts[1],
    body = await paymentBody(part.id);
  const path = `/bill-parts/${part.id}/payments`;
  const original = await f.a.primary.expect(path, 'POST', body);
  const orderId = body.sources[0].orderId;
  const ledger = await f.a.primary.expect(`/orders/${orderId}/payments`);
  await f.orderAction(orderId, 'refunds', {
    cashShiftId: body.cashShiftId,
    confirmed: true,
    reason: 'Rambursare parțială verificată',
    refunds: [{ paymentId: ledger.payments[0].id, amount: '1.00' }],
  });
  expect(await f.a.primary.expect(path, 'POST', body)).toEqual(original);
  const repay = await paymentBody(part.id);
  expect(repay.amount).toBe('1.00');
  const result = await f.a.primary.expect(path, 'POST', repay);
  expect(result.collection.operations).toHaveLength(1);
  expect(result.collection.operations[0].orderId).toBe(orderId);
});
it('anularea comenzii cere anularea planului, iar plata întârziată rămâne recuperabilă', async () => {
  const split = await splitVisit(),
    part = split.parts[1];
  const initial = await paymentBody(part.id);
  const last = initial.sources[initial.sources.length - 1].orderId;
  const current = await f.currentOrder(last);
  expect(
    (
      await f.a.primary.call(`/orders/${last}/cancel`, 'POST', {
        version: current.version,
        requestKey: randomUUID(),
        reason: 'Anulare înainte de încasare',
      })
    ).status,
  ).toBe(409);
  const body = initial;
  await f.a.primary.expect(`/bill-splits/${split.id}/void`, 'POST', {
    locationId: f.locationId,
    requestKey: randomUUID(),
    confirmed: true,
    reason: 'Refacerea notei înainte de încasare',
  });
  await f.orderAction(last, 'cancel', { reason: 'Anulare după eliberarea notei' });
  expect((await f.a.primary.call(`/bill-parts/${part.id}/payments`, 'POST', body)).status).toBe(
    409,
  );
  for (const source of body.sources)
    expect((await f.a.primary.expect(`/orders/${source.orderId}/payments`)).payments).toHaveLength(
      0,
    );
  expect(
    await f.a.primary.expect(`/bill-parts/${part.id}/payment-commands/resolution`, 'POST', {
      locationId: f.locationId,
      requestKey: body.requestKey,
    }),
  ).toMatchObject({ status: 'RETIRED' });
});
