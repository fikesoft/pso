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
async function create(context: { kind: 'ORDER' | 'VISIT'; id: string }, selection?: 'UNPLANNED') {
  const request = {
    locationId: f.locationId,
    context,
    division: { mode: 'EQUAL', count: 2 },
    ...(selection ? { selection } : {}),
  };
  const { preview } = await f.a.primary.expect('/bill-splits/preview', 'POST', request);
  const { split } = await f.a.primary.expect('/bill-splits', 'POST', {
    ...request,
    requestKey: randomUUID(),
    confirmed: true,
    ...(preview.visitVersion ? { visitVersion: preview.visitVersion } : {}),
    sources: preview.sources.map(({ orderId, version }: { orderId: string; version: number }) => ({
      orderId,
      version,
    })),
  });
  return split;
}
async function order(visitId: string) {
  const { order } = await f.linked(visitId, '10.01');
  await f.orderAction(order.id, 'send');
  return order;
}
const listPath = (kind: string, id: string) =>
  `/bill-splits?locationId=${f.locationId}&contextKind=${kind}&contextId=${id}`;
it('comenzile ulterioare formează un plan nou fără rescrierea primului', async () => {
  const visit = (await f.open((await f.table()).table.id)).event.result;
  const first = await order(visit.id),
    context = { kind: 'VISIT' as const, id: visit.id };
  const original = await create(context);
  const second = await order(visit.id);
  const request = { locationId: f.locationId, context, division: { mode: 'EQUAL', count: 2 } };
  expect((await f.a.primary.call('/bill-splits/preview', 'POST', request)).status).toBe(409);
  const additional = await create(context, 'UNPLANNED');
  expect(additional.sources.map((source: { orderId: string }) => source.orderId)).toEqual([
    second.id,
  ]);
  expect(
    (await f.a.primary.expect(`/bill-splits/${original.id}?locationId=${f.locationId}`)).split,
  ).toEqual(original);
  expect(
    (await f.a.primary.expect(listPath('VISIT', visit.id))).splits
      .map((split: { id: string }) => split.id)
      .sort(),
  ).toEqual([original.id, additional.id].sort());
  expect(
    (await f.a.primary.call('/bill-splits/preview', 'POST', { ...request, selection: 'UNPLANNED' }))
      .status,
  ).toBe(409);
  await f.a.primary.expect(`/bill-splits/${original.id}/void`, 'POST', {
    locationId: f.locationId,
    requestKey: randomUUID(),
    confirmed: true,
    reason: 'Reîmpărțirea primei note',
  });
  const replacement = await create(context, 'UNPLANNED');
  expect(replacement.sources.map((source: { orderId: string }) => source.orderId)).toEqual([
    first.id,
  ]);
});
it('lista include planurile moștenite după unire și păstrează autorizarea integrală', async () => {
  const source = (await f.open((await f.table()).table.id)).event.result;
  const target = (await f.open((await f.table()).table.id)).event.result;
  const originalOrder = await order(source.id);
  const split = await create({ kind: 'VISIT', id: source.id });
  await f.command(source.id, {
    kind: 'MERGED',
    targetVisitId: target.id,
    targetVersion: target.version,
    reason: 'Reunire după împărțire',
  });
  expect((await f.a.primary.expect(listPath('VISIT', target.id))).splits[0].id).toBe(split.id);
  expect((await f.a.primary.expect(listPath('ORDER', originalOrder.id))).splits[0].id).toBe(
    split.id,
  );
  expect((await f.tableActors.hiddenSplit!.session.call(listPath('VISIT', target.id))).status).toBe(
    403,
  );
  expect((await f.tableActors.reader!.session.call(listPath('VISIT', target.id))).status).toBe(403);
  expect(
    (
      await f.b.primary.call(
        `/bill-splits?locationId=${f.b.location.id}&contextKind=VISIT&contextId=${target.id}`,
      )
    ).status,
  ).toBe(404);
  expect(
    (
      await f.a.primary.call(
        `/bill-splits?locationId=${f.otherLocation.id}&contextKind=ORDER&contextId=${originalOrder.id}`,
      )
    ).status,
  ).toBe(404);
});
it('istoricul planurilor are paginare stabilă fără pierderi sau duplicate', async () => {
  const visit = (await f.open((await f.table()).table.id)).event.result;
  const source = await order(visit.id),
    ids = [];
  for (let index = 0; index < 11; index++) {
    const split = await create({ kind: 'ORDER', id: source.id });
    ids.push(split.id);
    if (index < 10)
      await f.a.primary.expect(`/bill-splits/${split.id}/void`, 'POST', {
        locationId: f.locationId,
        requestKey: randomUUID(),
        confirmed: true,
        reason: 'Refacere pentru paginare',
      });
  }
  const path = listPath('ORDER', source.id),
    first = await f.a.primary.expect(path);
  expect(first.splits).toHaveLength(10);
  expect(first.nextCursor).toBeTruthy();
  const second = await f.a.primary.expect(`${path}&cursor=${first.nextCursor}`);
  expect(second.splits).toHaveLength(1);
  expect(second.nextCursor).toBeNull();
  expect([...first.splits, ...second.splits].map((split: { id: string }) => split.id)).toEqual(
    ids.sort(),
  );
});
