import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, expect, it } from 'vitest';
import type { BillSplitPreviewDto } from '../packages/contracts/src';
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
async function request(includeFree = false) {
  const visit = (await f.open((await f.table()).table.id)).event.result;
  for (let i = 0; i < (includeFree ? 3 : 2); i++) {
    const { order } = await f.linked(visit.id, i === 2 ? '0' : '10.01');
    await f.orderAction(order.id, 'send');
  }
  const input = { locationId: f.locationId, context: { kind: 'VISIT', id: visit.id } };
  const initial: BillSplitPreviewDto = (
    await f.a.primary.expect('/bill-splits/preview', 'POST', {
      ...input,
      division: { mode: 'EQUAL', count: 2 },
    })
  ).preview;
  expect(initial.sourceItems).toHaveLength(includeFree ? 3 : 2);
  const body = {
    ...input,
    division: {
      mode: 'ITEMS',
      parts: ['0.300', '0.350', '0.350'].map((quantity) => ({
        items: initial.sourceItems!.map((item) => ({ orderItemId: item.orderItemId, quantity })),
      })),
    },
    confirmed: true,
    requestKey: randomUUID(),
    visitVersion: initial.visitVersion,
    sources: initial.sources.map(({ orderId, version }) => ({ orderId, version })),
  };
  return { body, initial };
}
it('previzualizează și persistă articolele, recuperează planul și încasează partea pe comenzile originale', async () => {
  const { body, initial } = await request();
  const {
    confirmed: _confirmed,
    requestKey: _key,
    sources: _sources,
    visitVersion: _version,
    ...input
  } = body;
  const preview: BillSplitPreviewDto = (
    await f.a.primary.expect('/bill-splits/preview', 'POST', input)
  ).preview;
  expect(preview.parts.map((part) => part.amount)).toEqual(['6.00', '7.02', '7.00']);
  expect(preview.parts[1]!.items!.map((item) => item.quantity)).toEqual(['0.350', '0.350']);
  const result = await f.a.primary.expect('/bill-splits', 'POST', body);
  expect(result.split.mode).toBe('ITEMS');
  expect(result.split.sourceItems).toEqual(initial.sourceItems);
  expect(result.split.parts[1].items).toEqual(preview.parts[1]!.items);
  expect(
    await f.a.primary.expect('/bill-splits', 'POST', {
      ...body,
      division: {
        ...body.division,
        parts: body.division.parts.map((part) => ({
          items: [...part.items].reverse(),
        })),
      },
    }),
  ).toEqual(result);
  const identity = {
    kind: 'CREATE',
    locationId: f.locationId,
    requestKey: body.requestKey,
    context: body.context,
  };
  expect(
    (await f.a.primary.expect('/bill-plan-commands/resolution', 'POST', identity)).result,
  ).toEqual(result);
  const partId = result.split.parts[1].id;
  const paymentPreview = (
    await f.a.primary.expect(`/bill-parts/${partId}/payment-preview?locationId=${f.locationId}`)
  ).preview;
  const payment = {
    locationId: f.locationId,
    requestKey: randomUUID(),
    cashShiftId: (await f.cashShift()).id,
    confirmed: true,
    amount: paymentPreview.outstandingAmount,
    payment: { method: 'CARD' },
    sources: paymentPreview.sources.map(
      ({ orderId, version }: { orderId: string; version: number }) => ({ orderId, version }),
    ),
  };
  const paid = await f.a.primary.expect(`/bill-parts/${partId}/payments`, 'POST', payment);
  expect(paid.collection.operations).toHaveLength(2);
  expect(paid.collection.amount).toBe('7.02');
  expect(await f.a.primary.expect(`/bill-parts/${partId}/payments`, 'POST', payment)).toEqual(paid);
  const current = (
    await f.a.primary.expect(`/bill-splits/${result.split.id}?locationId=${f.locationId}`)
  ).split;
  expect(current.parts[1].outstandingAmount).toBe('0.00');
  expect(current.parts[1].items).toEqual(preview.parts[1]!.items);
  for (const source of initial.sourceItems!) {
    const order = await f.currentOrder(source.orderId);
    expect(order.items[0].quantity).toBe('1.000');
    expect(order.total).toBe('10.01');
  }
});
it('refuză cantități alterate, articole străine, acces insuficient și versiuni vechi', async () => {
  const { body } = await request();
  const {
    confirmed: _confirmed,
    requestKey: _key,
    sources: _sources,
    visitVersion: _version,
    ...input
  } = body;
  for (const quantity of ['0.299', '0.301', '0', '0.3001']) {
    const bad = structuredClone(input);
    bad.division.parts[0]!.items[0]!.quantity = quantity;
    expect((await f.a.primary.call('/bill-splits/preview', 'POST', bad)).status).toBe(400);
  }
  const bad = structuredClone(input);
  bad.division.parts[0]!.items[0]!.orderItemId = randomUUID();
  expect((await f.a.primary.call('/bill-splits/preview', 'POST', bad)).status).toBe(400);
  for (const name of ['reader', 'hiddenSplit', 'splitLimited']) {
    const response = await f.tableActors[name]!.session.call('/bill-splits/preview', 'POST', input);
    expect(response.status).toBe(403);
    expect(JSON.stringify(response.data)).not.toContain(
      body.division.parts[0]!.items[0]!.orderItemId,
    );
  }
  expect(
    (
      await f.b.primary.call('/bill-splits/preview', 'POST', {
        ...input,
        locationId: f.b.location.id,
      })
    ).status,
  ).toBe(404);
  expect(
    (
      await f.a.primary.call('/bill-splits', 'POST', {
        ...body,
        sources: body.sources.map((source) => ({ ...source, version: 1 })),
      })
    ).status,
  ).toBe(409);
});
it('anulează și reface alocările păstrând istoricul; retrage cheile neexecutate', async () => {
  const { body } = await request();
  const result = await f.a.primary.expect('/bill-splits', 'POST', body);
  const swapped = structuredClone(body);
  swapped.division.parts.reverse();
  expect((await f.a.primary.call('/bill-splits', 'POST', swapped)).status).toBe(409);
  const voided = await f.a.primary.expect(`/bill-splits/${result.split.id}/void`, 'POST', {
    locationId: f.locationId,
    requestKey: randomUUID(),
    confirmed: true,
    reason: 'Refacem repartizarea articolelor',
  });
  expect(voided.split.parts[0].items).toEqual(result.split.parts[0].items);
  const recreated = await f.a.primary.expect('/bill-splits', 'POST', {
    ...swapped,
    requestKey: randomUUID(),
  });
  expect(recreated.split.id).not.toBe(result.split.id);
  expect(recreated.split.parts.map((part: { amount: string }) => part.amount)).toEqual([
    '7.02',
    '7.00',
    '6.00',
  ]);
  const pending = (await request()).body;
  expect(
    await f.a.primary.expect('/bill-plan-commands/resolution', 'POST', {
      kind: 'CREATE',
      locationId: f.locationId,
      requestKey: pending.requestKey,
      context: pending.context,
    }),
  ).toMatchObject({ status: 'RETIRED' });
  expect((await f.a.primary.call('/bill-splits', 'POST', pending)).status).toBe(409);
});

it('include comenzile gratuite în snapshot, fără încasări artificiale', async () => {
  const { body, initial } = await request(true);
  expect(initial.sources).toHaveLength(3);
  expect(initial.total).toBe('20.02');
  const free = initial.sourceItems!.find((item) => item.amount === '0.00')!;
  const { split } = await f.a.primary.expect('/bill-splits', 'POST', body);
  expect(split.sources).toHaveLength(3);
  expect(split.parts.map((part: { amount: string }) => part.amount)).toEqual([
    '6.00',
    '7.02',
    '7.00',
  ]);
  for (const part of split.parts) {
    expect(
      part.items.find((item: { orderItemId: string }) => item.orderItemId === free.orderItemId)
        .amount,
    ).toBe('0.00');
    expect(part.allocations).toHaveLength(2);
  }
  const partId = split.parts[0].id;
  const { preview } = await f.a.primary.expect(
    `/bill-parts/${partId}/payment-preview?locationId=${f.locationId}`,
  );
  const result = await f.a.primary.expect(`/bill-parts/${partId}/payments`, 'POST', {
    locationId: f.locationId,
    requestKey: randomUUID(),
    confirmed: true,
    cashShiftId: (await f.cashShift()).id,
    amount: preview.outstandingAmount,
    payment: { method: 'CARD' },
    sources: preview.sources.map(({ orderId, version }: { orderId: string; version: number }) => ({
      orderId,
      version,
    })),
  });
  expect(result.collection.operations).toHaveLength(2);
  expect((await f.a.primary.expect(`/orders/${free.orderId}/payments`)).payments).toHaveLength(0);
  expect((await f.currentOrder(free.orderId)).items[0].quantity).toBe('1.000');
});
