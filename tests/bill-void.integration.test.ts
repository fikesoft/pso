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
async function setup() {
  const visit = (await f.open((await f.table()).table.id)).event.result;
  const { order } = await f.linked(visit.id, '10.01');
  await f.orderAction(order.id, 'send');
  const request = {
    locationId: f.locationId,
    context: { kind: 'ORDER', id: order.id },
    division: { mode: 'EQUAL', count: 2 },
  };
  const create = async () => {
    const { preview } = await f.a.primary.expect('/bill-splits/preview', 'POST', request);
    return (
      await f.a.primary.expect('/bill-splits', 'POST', {
        ...request,
        requestKey: randomUUID(),
        confirmed: true,
        sources: preview.sources.map(
          ({ orderId, version }: { orderId: string; version: number }) => ({ orderId, version }),
        ),
      })
    ).split;
  };
  return { order, create, split: await create() };
}
it('anulează explicit planul fără plată, reface nota și păstrează istoricul', async () => {
  const { split, create, order } = await setup();
  const body = {
    locationId: f.locationId,
    requestKey: randomUUID(),
    confirmed: true,
    reason: 'Refacere în trei părți',
  };
  const path = `/bill-splits/${split.id}/void`;
  expect((await f.tableActors.reader!.session.call(path, 'POST', body)).status).toBe(403);
  const result = await f.a.primary.expect(path, 'POST', body);
  expect(result.split.status).toBe('VOIDED');
  expect(result.split.voided.reason).toBe(body.reason);
  expect(result.split.parts).toEqual(split.parts);
  expect(await f.a.primary.expect(path, 'POST', body)).toEqual(result);
  expect((await f.a.primary.call(path, 'POST', { ...body, reason: 'Alt motiv' })).status).toBe(409);
  expect((await f.a.primary.call(path, 'POST', { ...body, requestKey: randomUUID() })).status).toBe(
    409,
  );
  expect(
    (
      await f.a.primary.call(
        `/bill-parts/${split.parts[0].id}/payment-preview?locationId=${f.locationId}`,
      )
    ).status,
  ).toBe(409);
  const replacement = await create();
  expect(replacement.status).toBe('ACTIVE');
  expect(replacement.id).not.toBe(split.id);
  expect(replacement.sources[0].orderId).toBe(order.id);
  expect(
    (await f.a.primary.expect(`/bill-splits/${split.id}?locationId=${f.locationId}`)).split.status,
  ).toBe('VOIDED');
});
it('refuză anularea după încasare, inclusiv după rambursare integrală', async () => {
  const { split, order } = await setup();
  const part = split.parts[0],
    shift = await f.cashShift();
  const { preview } = await f.a.primary.expect(
    `/bill-parts/${part.id}/payment-preview?locationId=${f.locationId}`,
  );
  await f.a.primary.expect(`/bill-parts/${part.id}/payments`, 'POST', {
    locationId: f.locationId,
    requestKey: randomUUID(),
    cashShiftId: shift.id,
    confirmed: true,
    amount: preview.outstandingAmount,
    payment: { method: 'CARD' },
    sources: preview.sources.map(({ orderId, version }: { orderId: string; version: number }) => ({
      orderId,
      version,
    })),
  });
  const path = `/bill-splits/${split.id}/void`,
    body = {
      locationId: f.locationId,
      requestKey: randomUUID(),
      confirmed: true,
      reason: 'Tentativă după încasare',
    };
  expect((await f.a.primary.call(path, 'POST', body)).status).toBe(409);
  const { payments } = await f.a.primary.expect(`/orders/${order.id}/payments`);
  await f.orderAction(order.id, 'refunds', {
    cashShiftId: shift.id,
    confirmed: true,
    reason: 'Rambursare completă pentru probă',
    refunds: [{ paymentId: payments[0].id, amount: payments[0].amount }],
  });
  expect((await f.a.primary.call(path, 'POST', body)).status).toBe(409);
  expect(
    (await f.a.primary.expect(`/bill-splits/${split.id}?locationId=${f.locationId}`)).split.status,
  ).toBe('ACTIVE');
});
