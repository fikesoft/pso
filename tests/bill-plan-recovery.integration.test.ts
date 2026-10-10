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
async function request() {
  const visit = (await f.open((await f.table()).table.id)).event.result;
  const { order } = await f.linked(visit.id, '10.01');
  await f.orderAction(order.id, 'send');
  const input = {
    locationId: f.locationId,
    context: { kind: 'ORDER', id: order.id },
    division: { mode: 'EQUAL', count: 2 },
  };
  const { preview } = await f.a.primary.expect('/bill-splits/preview', 'POST', input);
  return {
    ...input,
    requestKey: randomUUID(),
    confirmed: true,
    sources: preview.sources.map(({ orderId, version }: { orderId: string; version: number }) => ({
      orderId,
      version,
    })),
  };
}
it('recuperează planul creat și anulat; refuză operatorul sau identitatea greșită', async () => {
  const body = await request();
  const created = await f.a.primary.expect('/bill-splits', 'POST', body);
  const identity = {
    kind: 'CREATE',
    locationId: f.locationId,
    requestKey: body.requestKey,
    context: body.context,
  };
  const path = '/bill-plan-commands/resolution';
  expect(await f.a.primary.expect(path, 'POST', identity)).toEqual({
    status: 'SUCCEEDED',
    command: identity,
    result: created,
  });
  expect((await f.tableActors.splitter!.session.call(path, 'POST', identity)).status).toBe(409);
  expect((await f.tableActors.reader!.session.call(path, 'POST', identity)).status).toBe(403);
  const other = await request();
  expect(
    (await f.a.primary.call(path, 'POST', { ...identity, context: other.context })).status,
  ).toBe(409);
  const voidBody = {
    locationId: f.locationId,
    requestKey: randomUUID(),
    confirmed: true,
    reason: 'Refacere după recuperare',
  };
  const voided = await f.a.primary.expect(
    `/bill-splits/${created.split.id}/void`,
    'POST',
    voidBody,
  );
  const voidIdentity = {
    kind: 'VOID',
    locationId: f.locationId,
    requestKey: voidBody.requestKey,
    splitId: created.split.id,
  };
  expect(await f.a.primary.expect(path, 'POST', voidIdentity)).toEqual({
    status: 'SUCCEEDED',
    command: voidIdentity,
    result: voided,
  });
  expect((await f.a.primary.expect(path, 'POST', identity)).result.split.status).toBe('VOIDED');
});
it('retrage cheile necunoscute de creare și anulare, blocând executarea întârziată', async () => {
  const body = await request(),
    path = '/bill-plan-commands/resolution';
  const identity = {
    kind: 'CREATE',
    locationId: f.locationId,
    requestKey: body.requestKey,
    context: body.context,
  };
  const retired = { status: 'RETIRED', command: identity };
  expect(await f.a.primary.expect(path, 'POST', identity)).toEqual(retired);
  expect(await f.a.primary.expect(path, 'POST', identity)).toEqual(retired);
  expect((await f.a.primary.call('/bill-splits', 'POST', body)).data.code).toBe(
    'BILL_PLAN_COMMAND_RETIRED',
  );
  expect((await f.tableActors.splitter!.session.call(path, 'POST', identity)).data.code).toBe(
    'BILL_PLAN_COMMAND_CONFLICT',
  );
  const { split } = await f.a.primary.expect('/bill-splits', 'POST', {
    ...body,
    requestKey: randomUUID(),
  });
  const voidBody = {
    locationId: f.locationId,
    requestKey: randomUUID(),
    confirmed: true,
    reason: 'Anulare întârziată refuzată',
  };
  const voidIdentity = {
    kind: 'VOID',
    locationId: f.locationId,
    requestKey: voidBody.requestKey,
    splitId: split.id,
  };
  expect(await f.a.primary.expect(path, 'POST', voidIdentity)).toEqual({
    status: 'RETIRED',
    command: voidIdentity,
  });
  expect(
    (await f.a.primary.call(`/bill-splits/${split.id}/void`, 'POST', voidBody)).data.code,
  ).toBe('BILL_PLAN_COMMAND_RETIRED');
  expect(
    (await f.a.primary.expect(`/bill-splits/${split.id}?locationId=${f.locationId}`)).split.status,
  ).toBe('ACTIVE');
  expect(
    (await f.b.primary.call(path, 'POST', { ...identity, locationId: f.b.location.id })).status,
  ).toBe(404);
});
