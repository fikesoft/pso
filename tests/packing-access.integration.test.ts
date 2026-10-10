import { randomUUID } from 'node:crypto';
import { beforeAll, afterAll, expect, it } from 'vitest';
import { preparePacking } from './api/packing-setup';
import type { PackingFixture } from './api/packing.types';
import { closeOperations } from './api/operations-setup';
import { BrowserSession } from './api/support/harness';

let f: PackingFixture;
beforeAll(async () => {
  f = await preparePacking();
}, 60_000);
afterAll(async () => {
  if (f) await closeOperations(f.owner.id);
});

it('ambalare: citirea, verificarea și finalizarea sunt drepturi distincte fără acces comercial implicit', async () => {
  const { session, path, order } = await f.create();
  const start = { action: 'START', version: 1, requestKey: randomUUID() };
  expect((await f.reader.session.call(path, 'POST', start)).status).toBe(403);
  expect((await f.finisher.session.call(path, 'POST', start)).status).toBe(403);
  expect((await f.operator.session.call(`/packing/sessions/${session.id}`)).status).toBe(403);
  expect(
    (await f.operator.session.call(`/packing/sessions?locationId=${f.a.location.id}`)).status,
  ).toBe(403);
  for (const url of [
    `/orders/${order.id}`,
    `/catalog?locationId=${f.a.location.id}`,
    `/kitchen/tickets?locationId=${f.a.location.id}`,
  ])
    expect((await f.reader.session.call(url)).status, url).toBe(403);
  await f.operator.session.expect(path, 'POST', start);
  expect((await f.a.primary.call(path, 'POST', start)).status).toBe(409);
  const check = {
    action: 'CHECK_ITEM',
    itemId: session.items[0]!.id,
    checked: true,
    version: 2,
    requestKey: randomUUID(),
  };
  expect((await f.finisher.session.call(path, 'POST', check)).status).toBe(403);
  await f.operator.session.expect(path, 'POST', check);
  await f.operator.session.expect(path, 'POST', {
    ...check,
    itemId: session.items[1]!.id,
    version: 3,
    requestKey: randomUUID(),
  });
  const complete = { action: 'COMPLETE', version: 4, requestKey: randomUUID() };
  expect((await f.operator.session.call(path, 'POST', complete)).status).toBe(403);
  const saved = await f.finisher.session.expect(path, 'POST', complete);
  const command = { sessionId: session.id, requestKey: complete.requestKey, action: 'COMPLETE' };
  expect(
    (await f.operator.session.call('/packing/commands/resolution', 'POST', command)).status,
  ).toBe(403);
  expect(
    (
      await f.operator.session.call('/packing/commands/resolution', 'POST', {
        ...command,
        action: 'START',
      })
    ).status,
  ).toBe(409);
  expect(
    (await f.reader.session.call('/packing/commands/resolution', 'POST', command)).status,
  ).toBe(403);
  expect(
    (await f.finisher.session.expect('/packing/commands/resolution', 'POST', command)).result,
  ).toEqual(saved.result);
});

it('ambalare: alt tenant și altă locație sunt refuzate inclusiv la recuperare și cursor', async () => {
  await f.a.primary.expect(
    `/catalog/products/${f.secondProduct.id}/locations/${f.otherLocation.id}`,
    'PUT',
    { price: '10', enabled: true },
  );
  const { session, path } = await f.create({
    locationId: f.otherLocation.id,
    items: [{ productId: f.secondProduct.id, quantity: '1' }],
  });
  const body = { action: 'START', version: 1, requestKey: randomUUID() };
  const command = { sessionId: session.id, requestKey: body.requestKey, action: body.action };
  expect(
    (await f.reader.session.call(`/packing/sessions?locationId=${f.otherLocation.id}`)).status,
  ).toBe(403);
  expect((await f.reader.session.call(`/packing/sessions/${session.id}`)).status).toBe(403);
  expect((await f.operator.session.call(path, 'POST', body)).status).toBe(403);
  expect(
    (await f.operator.session.call('/packing/commands/resolution', 'POST', command)).status,
  ).toBe(403);
  expect(
    (
      await f.reader.session.call(
        `/packing/sessions?locationId=${f.a.location.id}&cursor=${session.id}`,
      )
    ).status,
  ).toBe(400);
  expect((await f.b.primary.call(`/packing/sessions/${session.id}`)).status).toBe(404);
  expect((await f.b.primary.call(path, 'POST', body)).status).toBe(404);
  expect((await f.b.primary.call('/packing/commands/resolution', 'POST', command)).status).toBe(
    404,
  );
  expect((await f.b.primary.call(`/packing/sessions?locationId=${f.a.location.id}`)).status).toBe(
    404,
  );
});

it('ambalare: CSRF/Origin, contract strict și articol din altă sesiune nu produc efecte', async () => {
  const first = await f.create();
  const other = await f.create();
  const body = { action: 'START', version: 1, requestKey: randomUUID() };
  expect((await f.operator.session.call(first.path, 'POST', body, {}, false)).status).toBe(403);
  expect(
    (await f.operator.session.call(first.path, 'POST', body, { origin: 'https://invalid.example' }))
      .status,
  ).toBe(403);
  expect(
    (await f.operator.session.call(first.path, 'POST', body, { 'idempotency-key': randomUUID() }))
      .status,
  ).toBe(400);
  for (const patch of [
    { organizationId: f.a.company.organization.id },
    { actorUserId: f.operator.id },
    { status: 'READY' },
  ])
    expect((await f.operator.session.call(first.path, 'POST', { ...body, ...patch })).status).toBe(
      400,
    );
  await f.operator.session.expect(first.path, 'POST', body);
  const check = {
    action: 'CHECK_ITEM',
    itemId: other.session.items[0]!.id,
    checked: true,
    version: 2,
    requestKey: randomUUID(),
  };
  expect((await f.operator.session.call(first.path, 'POST', check)).status).toBe(404);
  expect(
    (
      await f.operator.session.call(first.path, 'POST', {
        ...check,
        itemId: first.session.items[0]!.id,
        checked: false,
      })
    ).status,
  ).toBe(409);
  expect((await f.operator.session.call(first.path, 'POST', { ...check, version: 1 })).status).toBe(
    409,
  );
  expect(
    (await f.reader.session.expect(`/packing/sessions/${first.session.id}`)).session.version,
  ).toBe(2);
});

it('ambalare: DENY retrage executarea, replay și recuperarea chiar după o sesiune nouă', async () => {
  const { session, path } = await f.create();
  const body = { action: 'START', version: 1, requestKey: randomUUID() };
  await f.operator.session.expect(path, 'POST', body);
  await f.a.primary.expect(`/staff/${f.operator.id}/overrides`, 'POST', {
    permission: 'packing.update',
    effect: 'DENY',
    scopeType: 'LOCATION',
    locationId: f.a.location.id,
  });
  expect((await f.operator.session.call(path, 'POST', body)).status).toBe(401);
  const fresh = new BrowserSession('TENANT');
  await fresh.login(f.operator.login, f.operator.password, f.a.company.organization.slug);
  expect((await fresh.call(path, 'POST', body)).status).toBe(403);
  expect(
    (
      await fresh.call('/packing/commands/resolution', 'POST', {
        sessionId: session.id,
        requestKey: body.requestKey,
        action: body.action,
      })
    ).status,
  ).toBe(403);
  expect((await f.a.primary.expect(`/packing/sessions/${session.id}`)).session.version).toBe(2);
});
