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
it('nota vizitei unite: previzualizare exactă, confirmare imuabilă și replay', async () => {
  const source = (await f.open((await f.table()).table.id)).event.result;
  const target = (await f.open((await f.table()).table.id)).event.result;
  const one = (await f.linked(source.id, '10.01')).order;
  const two = (await f.linked(target.id, '10.01')).order;
  await f.orderAction(one.id, 'send');
  await f.orderAction(two.id, 'send');
  await f.command(source.id, {
    kind: 'MERGED',
    targetVisitId: target.id,
    targetVersion: target.version,
    reason: 'Notă comună',
  });
  const request = {
    locationId: f.locationId,
    context: { kind: 'VISIT', id: target.id },
    division: { mode: 'EQUAL', count: 3 },
  };
  const actor = f.tableActors.splitter!.session;
  const { preview } = await actor.expect('/bill-splits/preview', 'POST', request);
  expect(preview.total).toBe('20.02');
  expect(preview.parts.map((part: { amount: string }) => part.amount)).toEqual([
    '6.68',
    '6.67',
    '6.67',
  ]);
  expect(preview.sources.map((row: { orderId: string }) => row.orderId).sort()).toEqual(
    [one.id, two.id].sort(),
  );
  const body = {
    ...request,
    requestKey: randomUUID(),
    confirmed: true,
    visitVersion: preview.visitVersion,
    sources: preview.sources.map(({ orderId, version }: { orderId: string; version: number }) => ({
      orderId,
      version,
    })),
  };
  const created = await actor.expect('/bill-splits', 'POST', body);
  expect(created.split.total).toBe('20.02');
  expect(created.split.parts).toHaveLength(3);
  expect(created.split.parts.map((part: { netPaidAmount: string }) => part.netPaidAmount)).toEqual([
    '0.00',
    '0.00',
    '0.00',
  ]);
  expect(
    created.split.parts.map((part: { outstandingAmount: string }) => part.outstandingAmount),
  ).toEqual(['6.68', '6.67', '6.67']);
  expect(
    await actor.expect('/bill-splits', 'POST', { ...body, sources: [...body.sources].reverse() }),
  ).toEqual(created);
  expect(await actor.expect(`/bill-splits/${created.split.id}?locationId=${f.locationId}`)).toEqual(
    created,
  );
  expect(
    (await actor.call('/bill-splits', 'POST', { ...body, division: { mode: 'EQUAL', count: 2 } }))
      .status,
  ).toBe(409);
  expect(
    (await actor.call('/bill-splits', 'POST', { ...body, requestKey: randomUUID() })).status,
  ).toBe(409);
  expect(
    (await f.b.primary.call(`/bill-splits/${created.split.id}?locationId=${f.b.location.id}`))
      .status,
  ).toBe(404);
});
it('nota nu divulgă comenzi ascunse și aplică plafonul pe totalul agregat', async () => {
  const visit = (await f.open((await f.table()).table.id)).event.result;
  const expensive = (await f.linked(visit.id, '12')).order;
  const cheap = (await f.linked(visit.id, '5')).order;
  for (const order of [expensive, cheap]) await f.orderAction(order.id, 'send');
  const request = {
    locationId: f.locationId,
    context: { kind: 'VISIT', id: visit.id },
    division: { mode: 'EQUAL', count: 2 },
  };
  for (const name of ['reader', 'hiddenSplit', 'splitLimited']) {
    const result = await f.tableActors[name]!.session.call('/bill-splits/preview', 'POST', request);
    expect(result.status).toBe(403);
    expect(JSON.stringify(result.data)).not.toContain(expensive.id);
  }
  expect(
    (
      await f.a.primary.call('/bill-splits/preview', 'POST', {
        ...request,
        locationId: f.otherLocation.id,
      })
    ).status,
  ).toBe(404);
});
it('confirmarea refuză versiuni sau componență schimbată și sume personalizate divergente', async () => {
  const visit = (await f.open((await f.table()).table.id)).event.result;
  const order = (await f.linked(visit.id, '10.01')).order;
  await f.orderAction(order.id, 'send');
  const request = {
    locationId: f.locationId,
    context: { kind: 'VISIT', id: visit.id },
    division: { mode: 'CUSTOM', amounts: ['5.00', '5.01'] },
  };
  const { preview } = await f.a.primary.expect('/bill-splits/preview', 'POST', request);
  expect(
    (
      await f.a.primary.call('/bill-splits/preview', 'POST', {
        ...request,
        division: { mode: 'CUSTOM', amounts: ['5.00', '5.00'] },
      })
    ).status,
  ).toBe(400);
  const body = {
    ...request,
    confirmed: true,
    requestKey: randomUUID(),
    visitVersion: preview.visitVersion,
    sources: preview.sources.map(({ orderId, version }: { orderId: string; version: number }) => ({
      orderId,
      version,
    })),
  };
  await f.command(visit.id, { kind: 'GUEST_COUNT_CHANGED', guestCount: 3 });
  expect((await f.a.primary.call('/bill-splits', 'POST', body)).status).toBe(409);
  const updated = (await f.a.primary.expect('/bill-splits/preview', 'POST', request)).preview;
  const extra = (await f.linked(visit.id, '1')).order;
  await f.orderAction(extra.id, 'send');
  expect(
    (
      await f.a.primary.call('/bill-splits', 'POST', {
        ...body,
        visitVersion: updated.visitVersion,
      })
    ).status,
  ).toBe(409);
  const single = {
    locationId: f.locationId,
    context: { kind: 'ORDER', id: order.id },
    division: { mode: 'CUSTOM', amounts: ['5.00', '5.01'] },
  };
  const current = (await f.a.primary.expect('/bill-splits/preview', 'POST', single)).preview;
  const split = await f.a.primary.expect('/bill-splits', 'POST', {
    ...single,
    confirmed: true,
    requestKey: randomUUID(),
    sources: current.sources.map(({ orderId, version }: { orderId: string; version: number }) => ({
      orderId,
      version,
    })),
  });
  expect(split.split.parts.map((part: { amount: string }) => part.amount)).toEqual([
    '5.00',
    '5.01',
  ]);
});
