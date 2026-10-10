import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { prepareTables } from './api/tables-setup';
import type { TablesFixture } from './api/tables.types';
import { closeOperations } from './api/operations-setup';
let f: TablesFixture;
beforeAll(async () => {
  f = await prepareTables();
}, 60_000);
afterAll(async () => {
  if (f) await closeOperations(f.owner.id);
});
it('unirea păstrează comenzile și nota, cu istoric, replay și recuperare după schimbarea sursei', async () => {
  const { table: sourceTable } = await f.table();
  const { table: targetTable } = await f.table();
  const source = (await f.open(sourceTable.id)).event.result;
  const target = (await f.open(targetTable.id, f.tableActors.colleague!.session)).event.result;
  const { order } = await f.linked(source.id, '20');
  const targetOrder = (await f.linked(target.id, '5')).order;
  const sent = await f.orderAction(order.id, 'send');
  await f.command(source.id, { kind: 'BILL_REQUESTED' });
  const result = await f.command(source.id, {
    kind: 'MERGED',
    targetVisitId: target.id,
    targetVersion: target.version,
    reason: 'Servire împreună',
  });
  expect(result.event.result).toMatchObject({ status: 'MERGED', mergedIntoVisitId: target.id });
  expect((await f.visit(target.id)).visit).toMatchObject({
    guestCount: 4,
    billRequested: true,
    waiter: target.waiter,
  });
  const actor = f.tableActors.waiter!.session;
  const list = await actor.expect(
    `/table-visits/${target.id}/orders?locationId=${f.locationId}&statusGroup=ALL`,
  );
  expect(list.orders.map((row: { id: string }) => row.id).sort()).toEqual(
    [order.id, targetOrder.id].sort(),
  );
  const hidden = await f.tableActors.limited!.session.expect(
    `/table-visits/${target.id}/orders?locationId=${f.locationId}&statusGroup=ALL`,
  );
  expect(hidden.orders.map((row: { id: string }) => row.id)).toEqual([targetOrder.id]);
  expect((await f.visit(target.id)).closeBlocked).toBe(true);
  expect(
    (await actor.expect(`/table-visits/${source.id}/commands`, 'POST', result.body)).event,
  ).toEqual(result.event);
  expect(
    (
      await actor.call(`/table-visits/${source.id}/commands`, 'POST', {
        ...result.body,
        targetVersion: 99,
      })
    ).data.code,
  ).toBe('TABLE_COMMAND_CONFLICT');
  const identity = {
    locationId: f.locationId,
    requestKey: result.body.requestKey,
    kind: 'MERGED',
    visitId: source.id,
    targetVisitId: target.id,
  };
  expect(await actor.expect('/table-visit-commands/resolution', 'POST', identity)).toMatchObject({
    status: 'SUCCEEDED',
    result: { event: result.event },
  });
  const unused = { ...identity, requestKey: randomUUID() };
  expect(await actor.expect('/table-visit-commands/resolution', 'POST', unused)).toMatchObject({
    status: 'RETIRED',
  });
  expect(
    (
      await actor.call(`/table-visits/${source.id}/commands`, 'POST', {
        ...result.body,
        requestKey: unused.requestKey,
      })
    ).data.code,
  ).toBe('TABLE_COMMAND_RETIRED');
  const kitchen = await f.a.primary.expect(
    `/kitchen/tickets?locationId=${f.locationId}&status=QUEUED`,
  );
  expect(kitchen.tickets.find((t: { id: string }) => t.id === sent.ticket.id).tableLabel).toBe(
    targetTable.code,
  );
  expect((await f.currentOrder(order.id)).tableVisitId).toBe(source.id);
  await f.command(target.id, { kind: 'BILL_CANCELLED' });
  await f.command(target.id, { kind: 'BILL_REQUESTED' });
  expect((await f.history(source.id)).events[0].kind).toBe('MERGED');
  expect(
    (await f.history(target.id)).events.some((e: { kind: string }) => e.kind === 'MERGE_RECEIVED'),
  ).toBe(true);
});
it('unirea verifică ambele versiuni, locația, tenantul și drepturile', async () => {
  const source = (await f.open((await f.table()).table.id)).event.result;
  const target = (await f.open((await f.table()).table.id)).event.result;
  const other = (
    await f.open((await f.table({ locationId: f.otherLocation.id })).table.id, f.a.primary, {
      locationId: f.otherLocation.id,
    })
  ).event.result;
  const foreign = (
    await f.open(
      (await f.table({ locationId: f.b.location.id }, f.b.primary)).table.id,
      f.b.primary,
      { locationId: f.b.location.id },
    )
  ).event.result;
  const body = {
    locationId: f.locationId,
    requestKey: randomUUID(),
    kind: 'MERGED',
    version: 1,
    targetVisitId: target.id,
    targetVersion: 1,
    reason: 'Reunire explicită',
  };
  const path = `/table-visits/${source.id}/commands`;
  expect((await f.tableActors.reader!.session.call(path, 'POST', body)).status).toBe(403);
  for (const targetVisitId of [other.id, foreign.id])
    expect((await f.a.primary.call(path, 'POST', { ...body, targetVisitId })).status).toBe(404);
  expect((await f.a.primary.call(path, 'POST', { ...body, targetVisitId: source.id })).status).toBe(
    409,
  );
  await f.command(target.id, { kind: 'GUEST_COUNT_CHANGED', guestCount: 3 });
  expect((await f.a.primary.call(path, 'POST', body)).data.code).toBe(
    'TABLE_VISIT_VERSION_CONFLICT',
  );
  expect((await f.visit(source.id)).visit.status).toBe('OPEN');
});
