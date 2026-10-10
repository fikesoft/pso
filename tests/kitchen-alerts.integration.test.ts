import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { prepareOperations, closeOperations } from './api/operations-setup';
import { BrowserSession, activate } from './api/support/harness';
let f: Awaited<ReturnType<typeof prepareOperations>>;
beforeAll(async () => {
  f = await prepareOperations();
}, 60_000);
afterAll(async () => {
  if (f) await closeOperations(f.owner.id);
});

function command() {
  return {
    scope: { scopeType: 'ORGANIZATION' },
    target: { kind: 'DEFAULT' },
    requestKey: randomUUID(),
    version: 0,
    thresholds: { warningSeconds: 600, criticalSeconds: 900 },
  };
}

it('alerte: versiuni, replay istoric, conflicte și retragerea unei tentative necunoscute', async () => {
  const body = command();
  const identity = { scope: body.scope, target: body.target };
  expect(await f.a.primary.expect('/kitchen-alerts/read', 'POST', identity)).toEqual({
    rule: { ...identity, version: 0, thresholds: null },
  });
  const first = await f.a.primary.expect('/kitchen-alerts', 'PUT', body);
  expect(first.rule).toEqual({ ...identity, version: 1, thresholds: body.thresholds });
  const cleared = await f.a.primary.expect('/kitchen-alerts', 'PUT', {
    ...body,
    requestKey: randomUUID(),
    version: 1,
    thresholds: null,
  });
  expect(cleared.rule).toEqual({ ...identity, version: 2, thresholds: null });
  expect(await f.a.primary.expect('/kitchen-alerts', 'PUT', body)).toEqual(first);
  expect(
    (
      await f.a.primary.call('/kitchen-alerts', 'PUT', {
        ...body,
        thresholds: { warningSeconds: 10, criticalSeconds: 20 },
      })
    ).status,
  ).toBe(409);
  expect(
    (
      await f.a.primary.call('/kitchen-alerts', 'PUT', {
        ...body,
        requestKey: randomUUID(),
      })
    ).status,
  ).toBe(409);
  const resolve = '/kitchen-alert-commands/resolution';
  const original = { ...identity, requestKey: body.requestKey };
  expect(await f.a.primary.expect(resolve, 'POST', original)).toEqual({
    status: 'SUCCEEDED',
    command: original,
    result: first,
  });
  const retired = { ...identity, requestKey: randomUUID() };
  expect(await f.a.primary.expect(resolve, 'POST', retired)).toEqual({
    status: 'RETIRED',
    command: retired,
  });
  expect(
    (
      await f.a.primary.call('/kitchen-alerts', 'PUT', {
        ...body,
        requestKey: retired.requestKey,
        version: 2,
      })
    ).status,
  ).toBe(409);
  expect(await f.a.primary.expect('/kitchen-alerts/read', 'POST', identity)).toEqual(cleared);
});

it('alerte: toate țintele, izolarea tenantului și a stației, payload strict', async () => {
  const { station } = await f.a.primary.expect('/kitchen-stations', 'POST', {
    locationId: f.a.location.id,
    requestKey: randomUUID(),
    code: 'ALERT',
    name: 'Stație alerte',
    sortOrder: 1,
  });
  const local = { scopeType: 'LOCATION', locationId: f.a.location.id };
  const targets = [
    { kind: 'DEFAULT' },
    { kind: 'STATION', stationId: station.id },
    { kind: 'PRODUCT', productId: f.product.id },
    { kind: 'CATEGORY', categoryId: f.category.id },
  ];
  for (const target of targets) {
    const body = { ...command(), scope: local, target };
    expect((await f.a.primary.expect('/kitchen-alerts', 'PUT', body)).rule.version).toBe(1);
    expect(
      (await f.cook.call('/kitchen-alerts/read', 'POST', { scope: local, target })).status,
    ).toBe(403);
    expect((await f.cook.call('/kitchen-alerts', 'PUT', body)).status).toBe(403);
    expect(
      (
        await f.cook.call('/kitchen-alert-commands/resolution', 'POST', {
          scope: local,
          target,
          requestKey: body.requestKey,
        })
      ).status,
    ).toBe(403);
  }
  for (const target of targets.slice(2)) {
    expect(
      (await f.a.primary.expect('/kitchen-alerts', 'PUT', { ...command(), target })).rule.version,
    ).toBe(1);
    expect(
      (await f.b.primary.call('/kitchen-alerts', 'PUT', { ...command(), target })).status,
    ).toBe(404);
  }
  expect(
    (
      await f.a.primary.call('/kitchen-alerts', 'PUT', {
        ...command(),
        scope: { scopeType: 'LOCATION', locationId: f.otherLocation.id },
        target: targets[1],
      })
    ).status,
  ).toBe(404);
  for (const extra of [
    { scope: { scopeType: 'ORGANIZATION', locationId: f.a.location.id } },
    { organizationId: f.b.company.organization.id },
    { target: targets[1] },
    { thresholds: { warningSeconds: 10, criticalSeconds: 10 } },
  ])
    expect(
      (await f.a.primary.call('/kitchen-alerts', 'PUT', { ...command(), ...extra })).status,
    ).toBe(400);
});

it('alerte: dreptul local nu devine drept organizațional sau acces la altă locație', async () => {
  const { role } = await f.a.primary.expect('/roles', 'POST', {
    name: 'Administrator praguri locale',
    permissions: [{ permission: 'kitchen.alerts.manage' }],
  });
  const created = await f.a.primary.expect('/staff', 'POST', {
    login: 'alert-manager',
    displayName: 'Administrator alerte',
    locationIds: [f.a.location.id],
    assignments: [
      { roleVersionId: role.versions[0].id, scopeType: 'LOCATION', locationId: f.a.location.id },
    ],
  });
  const manager = new BrowserSession('TENANT');
  await activate(
    manager,
    'alert-manager',
    created.temporaryPassword,
    f.a.company.organization.slug,
  );
  const body = {
    ...command(),
    scope: { scopeType: 'LOCATION', locationId: f.a.location.id },
    target: { kind: 'PRODUCT', productId: f.secondProduct.id },
  };
  const saved = await manager.expect('/kitchen-alerts', 'PUT', body);
  expect(saved.rule.version).toBe(1);
  for (const scope of [
    { scopeType: 'ORGANIZATION' },
    { scopeType: 'LOCATION', locationId: f.otherLocation.id },
  ]) {
    expect(
      (await manager.call('/kitchen-alerts', 'PUT', { ...body, scope, requestKey: randomUUID() }))
        .status,
    ).toBe(403);
    expect(
      (await manager.call('/kitchen-alerts/read', 'POST', { scope, target: body.target })).status,
    ).toBe(403);
    expect(
      (
        await manager.call('/kitchen-alert-commands/resolution', 'POST', {
          scope,
          target: body.target,
          requestKey: randomUUID(),
        })
      ).status,
    ).toBe(403);
  }
});
