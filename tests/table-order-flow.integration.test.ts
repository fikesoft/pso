import { completePacking } from './api/complete-packing';
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
it('vizita: comanda explicită, stările bucătăriei și încasarea permit închiderea fără pierderea istoricului', async () => {
  const { table } = await f.table();
  const opened = await f.open(table.id);
  const id = opened.event.visitId;
  const { order, body } = await f.linked(id, '20');
  expect(order).toMatchObject({ tableVisitId: id, tableLabel: table.code, source: 'WAITER' });
  expect((await f.visit(id)).state).toBe('OCCUPIED');
  const sent = await f.orderAction(order.id, 'send');
  expect((await f.visit(id)).state).toBe('WAITING_FOOD');
  await f.kitchen(sent.ticket.id, 1, 'PREPARING');
  await f.kitchen(sent.ticket.id, 2, 'PARTIALLY_READY');
  expect(await f.visit(id)).toMatchObject({
    state: 'READY',
    hasReadyFood: true,
    hasWaitingFood: true,
  });
  const bill = await f.command(id, { kind: 'BILL_REQUESTED' });
  expect((await f.visit(id)).state).toBe('PAYMENT_REQUESTED');
  const closeBody = {
    locationId: f.locationId,
    version: bill.event.result.version,
    requestKey: randomUUID(),
    kind: 'CLOSE',
    reason: 'Închidere înainte de plată',
  };
  const rejected = await f.tableActors.limited!.session.call(
    `/table-visits/${id}/commands`,
    'POST',
    closeBody,
  );
  expect(rejected.status).toBe(409);
  expect(rejected.data.code).toBe('TABLE_VISIT_HAS_OPEN_ORDERS');
  expect(JSON.stringify(rejected.data)).not.toContain(order.id);
  const hidden = await f.tableActors.limited!.session.expect(
    `/table-visits/${id}/orders?locationId=${f.locationId}&statusGroup=ALL`,
  );
  expect(hidden.orders).toEqual([]);
  await f.kitchen(sent.ticket.id, 3, 'READY');
  const current = await completePacking(f.a.primary, order.id);
  const shift = await f.cashShift();
  await f.a.primary.expect(`/orders/${order.id}/checkout/manual`, 'POST', {
    version: current.version,
    requestKey: randomUUID(),
    cashShiftId: shift.id,
    method: 'CASH',
    receivedAmount: '20',
    confirmed: true,
  });
  expect(await f.visit(id)).toMatchObject({ state: 'PAYMENT_REQUESTED', closeBlocked: false });
  const closed = await f.close(id);
  expect(closed.event.result.status).toBe('CLOSED');
  expect(
    (await f.map()).tables.find((row: { table: { id: string } }) => row.table.id === table.id)
      .state,
  ).toBe('FREE');
  expect((await f.tableActors.waiter!.session.expect('/orders', 'POST', body)).order.id).toBe(
    order.id,
  );
  const next = await f.tableActors.waiter!.session.call('/orders', 'POST', {
    ...body,
    requestKey: randomUUID(),
  });
  expect(next.status).toBe(409);
  expect(next.data.code).toBe('TABLE_VISIT_NOT_OPEN');
  expect((await f.history(id)).events).toHaveLength(3);
});
it('vizita: retry și retragere durabilă, ținte străine și modificarea asocierii sunt refuzate', async () => {
  const { table } = await f.table();
  const opened = await f.open(table.id);
  const id = opened.event.visitId;
  const actor = f.tableActors.waiter!.session;
  const identity = {
    locationId: f.locationId,
    requestKey: opened.body.requestKey,
    kind: 'OPEN',
    tableId: table.id,
  };
  expect(await actor.expect('/table-visit-commands/resolution', 'POST', identity)).toMatchObject({
    status: 'SUCCEEDED',
    command: identity,
    result: { event: opened.event },
  });
  const key = randomUUID();
  const retirement = { ...identity, requestKey: key };
  expect(await actor.expect('/table-visit-commands/resolution', 'POST', retirement)).toMatchObject({
    status: 'RETIRED',
    command: retirement,
  });
  expect(
    (
      await actor.call(`/dining-tables/${table.id}/visits`, 'POST', {
        ...opened.body,
        requestKey: key,
      })
    ).data.code,
  ).toBe('TABLE_COMMAND_RETIRED');
  const { order, body } = await f.linked(id);
  const patch = {
    version: order.version,
    serviceType: 'DINE_IN',
    tableLabel: 'ALTĂ MASĂ',
    items: body.items,
  };
  expect((await actor.call(`/orders/${order.id}`, 'PATCH', patch)).data.code).toBe(
    'TABLE_ORDER_ASSOCIATION_IMMUTABLE',
  );
  expect((await f.b.primary.call(`/table-visits/${id}?locationId=${f.b.location.id}`)).status).toBe(
    404,
  );
  expect(
    (await f.a.primary.call(`/table-visits/${id}?locationId=${f.otherLocation.id}`)).status,
  ).toBe(404);
  const denied = await f.tableActors.reader!.session.call(
    `/table-visits/${id}/orders?locationId=${f.locationId}`,
  );
  expect(denied.status).toBe(403);
});
