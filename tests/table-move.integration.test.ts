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
it('mutare: păstrează comenzile, nota și istoricul, eliberează sursa și actualizează masa KDS', async () => {
  const { table: source } = await f.table();
  const { table: target } = await f.table();
  const opened = await f.open(source.id);
  const id = opened.event.visitId;
  const { order } = await f.linked(id);
  const sent = await f.orderAction(order.id, 'send');
  await f.command(id, { kind: 'BILL_REQUESTED' });
  const moved = await f.command(id, {
    kind: 'MOVED',
    targetTableId: target.id,
    reason: 'Clienții preferă terasa',
  });
  expect(moved.event).toMatchObject({
    tableId: source.id,
    previousTable: { id: source.id, code: source.code },
    result: {
      id,
      tableId: target.id,
      tableCode: target.code,
      billRequested: true,
      guestCount: 2,
      waiter: opened.event.result.waiter,
    },
  });
  const actor = f.tableActors.waiter!.session;
  expect((await actor.expect(`/table-visits/${id}/commands`, 'POST', moved.body)).event).toEqual(
    moved.event,
  );
  expect(
    (
      await actor.call(`/table-visits/${id}/commands`, 'POST', {
        ...moved.body,
        targetTableId: source.id,
      })
    ).data.code,
  ).toBe('TABLE_COMMAND_CONFLICT');
  const identity = {
    locationId: f.locationId,
    requestKey: moved.body.requestKey,
    kind: 'MOVED',
    visitId: id,
    targetTableId: target.id,
  };
  expect(await actor.expect('/table-visit-commands/resolution', 'POST', identity)).toMatchObject({
    status: 'SUCCEEDED',
    result: { event: moved.event },
  });
  expect(
    (
      await actor.call('/table-visit-commands/resolution', 'POST', {
        ...identity,
        targetTableId: source.id,
      })
    ).status,
  ).toBe(409);
  expect((await f.currentOrder(order.id)).tableLabel).toBe(source.code);
  const kitchen = await f.a.primary.expect(
    `/kitchen/tickets?locationId=${f.locationId}&status=QUEUED`,
  );
  expect(
    kitchen.tickets.find((ticket: { id: string }) => ticket.id === sent.ticket.id).tableLabel,
  ).toBe(target.code);
  const rows = (await f.map()).tables;
  expect(rows.find((row: { table: { id: string } }) => row.table.id === source.id).state).toBe(
    'FREE',
  );
  expect(rows.find((row: { table: { id: string } }) => row.table.id === target.id).state).toBe(
    'PAYMENT_REQUESTED',
  );
  const next = await f.linked(id);
  expect(next.order.tableLabel).toBe(target.code);
  await f.kitchen(sent.ticket.id, 1, 'PREPARING');
  expect((await f.history(id)).events.at(-1).result.tableId).toBe(source.id);
});
it('mutare: refuză ținte străine, ocupate/arhivate, versiuni vechi și accesul doar de citire', async () => {
  const { table: source } = await f.table();
  const { table: target } = await f.table();
  const { table: foreign } = await f.table({ locationId: f.b.location.id }, f.b.primary);
  const { table: other } = await f.table({ locationId: f.otherLocation.id });
  const visit = (await f.open(source.id)).event.result;
  const body = {
    locationId: f.locationId,
    requestKey: randomUUID(),
    version: visit.version,
    kind: 'MOVED',
    targetTableId: target.id,
    reason: 'Cerere explicită',
  };
  const actor = f.tableActors.waiter!.session;
  const path = `/table-visits/${visit.id}/commands`;
  expect((await f.tableActors.reader!.session.call(path, 'POST', body)).status).toBe(403);
  for (const targetTableId of [foreign.id, other.id])
    expect((await actor.call(path, 'POST', { ...body, targetTableId })).status).toBe(404);
  await f.open(target.id);
  expect((await actor.call(path, 'POST', body)).status).toBe(409);
  const { table: archived } = await f.table();
  await f.a.primary.expect(`/dining-tables/${archived.id}/archive`, 'POST', {
    locationId: f.locationId,
    requestKey: randomUUID(),
    version: archived.version,
  });
  expect((await actor.call(path, 'POST', { ...body, targetTableId: archived.id })).status).toBe(
    409,
  );
  const { table: free } = await f.table();
  await f.command(visit.id, { kind: 'GUEST_COUNT_CHANGED', guestCount: 3 });
  expect((await actor.call(path, 'POST', { ...body, targetTableId: free.id })).data.code).toBe(
    'TABLE_VISIT_VERSION_CONFLICT',
  );
  const key = randomUUID();
  await actor.expect('/table-visit-commands/resolution', 'POST', {
    locationId: f.locationId,
    requestKey: key,
    kind: 'MOVED',
    visitId: visit.id,
    targetTableId: free.id,
  });
  expect(
    (
      await actor.call(path, 'POST', {
        ...body,
        version: 2,
        requestKey: key,
        targetTableId: free.id,
      })
    ).data.code,
  ).toBe('TABLE_COMMAND_RETIRED');
});
