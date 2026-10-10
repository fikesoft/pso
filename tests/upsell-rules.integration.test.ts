import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { closeOperations, prepareOperations } from './api/operations-setup';
import type { OperationsFixture } from './api/operations.types';

let f: OperationsFixture;
let rule: { id: string; version: number };
beforeAll(async () => {
  f = await prepareOperations();
});
afterAll(async () => {
  if (f) await closeOperations(f.owner.id);
});

it('manages local upsell rules with idempotency, immutable references, version conflicts and tenant isolation', async () => {
  const { a, b, manager, worker, product, secondProduct, otherLocation } = f;
  const body = {
    requestKey: randomUUID(),
    locationId: a.location.id,
    sourceProductId: product.id,
    targetProductId: secondProduct.id,
    name: 'Cafea și ceai',
    sortOrder: 1,
  };
  expect((await worker.call('/catalog/upsell-rules', 'POST', body)).status).toBe(403);
  expect(
    (await manager.call('/catalog/upsell-rules', 'POST', { ...body, locationId: otherLocation.id }))
      .status,
  ).toBe(403);
  expect(
    (await b.primary.call('/catalog/upsell-rules', 'POST', { ...body, locationId: b.location.id }))
      .status,
  ).toBe(400);
  expect(
    (await manager.call('/catalog/upsell-rules', 'POST', { ...body, targetProductId: product.id }))
      .status,
  ).toBe(400);
  const responses = await Promise.all([
    manager.expect('/catalog/upsell-rules', 'POST', body),
    manager.expect('/catalog/upsell-rules', 'POST', body),
  ]);
  expect(responses[0]).toEqual(responses[1]);
  rule = responses[0].rule;
  expect(
    (await manager.call('/catalog/upsell-rules', 'POST', { ...body, name: 'Altă regulă' })).status,
  ).toBe(409);
  expect(
    (await manager.call('/catalog/upsell-rules', 'POST', { ...body, requestKey: randomUUID() }))
      .status,
  ).toBe(409);
  expect((await b.primary.call(`/catalog/upsell-rules/${rule.id}`)).status).toBe(404);
  expect((await worker.call(`/catalog/upsell-rules?locationId=${a.location.id}`)).status).toBe(403);
  expect(
    (
      await manager.call(`/catalog/upsell-rules/${rule.id}`, 'PATCH', {
        name: body.name,
        sortOrder: 1,
        status: 'ACTIVE',
        version: rule.version,
        targetProductId: product.id,
      })
    ).status,
  ).toBe(400);
  const writes = await Promise.all(
    [2, 3].map((sortOrder) =>
      manager.call(`/catalog/upsell-rules/${rule.id}`, 'PATCH', {
        name: body.name,
        sortOrder,
        status: 'ACTIVE',
        version: rule.version,
      }),
    ),
  );
  expect(writes.map((value) => value.status).sort()).toEqual([200, 409]);
  rule = writes.find((value) => value.status === 200)!.data.rule;
  expect(
    (await manager.expect(`/catalog/upsell-rules?locationId=${a.location.id}`)).rules,
  ).toHaveLength(1);
  expect(
    (await a.primary.expect('/audit')).events.some(
      (event: { action: string; targetId: string }) =>
        event.action === 'catalog.upsell_rule.created' && event.targetId === rule.id,
    ),
  ).toBe(true);
});

it('suggests only available local products outside the cart and respects stop-list, schedules and archival', async () => {
  const { a, b, worker, cook, manager, product, secondProduct } = f;
  const preview = (productIds = [product.id]) =>
    worker.expect('/catalog/upsell-suggestions', 'POST', { locationId: a.location.id, productIds });
  expect((await preview()).suggestions).toMatchObject([
    { ruleId: rule.id, target: { id: secondProduct.id, price: secondProduct.price } },
  ]);
  expect((await preview([])).suggestions).toEqual([]);
  expect((await preview([product.id, secondProduct.id])).suggestions).toEqual([]);
  expect(
    (
      await cook.call('/catalog/upsell-suggestions', 'POST', {
        locationId: a.location.id,
        productIds: [product.id],
      })
    ).status,
  ).toBe(403);
  expect(
    (
      await worker.call('/catalog/upsell-suggestions', 'POST', {
        locationId: b.location.id,
        productIds: [product.id],
      })
    ).status,
  ).toBe(403);
  let local = secondProduct;
  for (const enabled of [false, true]) {
    local = (
      await manager.expect(
        `/catalog/products/${secondProduct.id}/locations/${a.location.id}`,
        'PUT',
        { version: local.locationVersion, price: local.price, enabled },
      )
    ).product;
    expect((await preview()).suggestions).toHaveLength(enabled ? 1 : 0);
  }
  const scheduleBody = {
    name: 'Program istoric recomandări',
    eventName: null,
    weekdays: [0, 1, 2, 3, 4, 5, 6],
    startMinute: 0,
    endMinute: 1440,
    startsOn: '1970-01-01',
    endsOn: '1970-01-01',
    productIds: [secondProduct.id],
  };
  const schedule = (
    await manager.expect('/catalog/menu-schedules', 'POST', {
      ...scheduleBody,
      locationId: a.location.id,
      requestKey: randomUUID(),
    })
  ).schedule;
  expect((await preview()).suggestions).toEqual([]);
  await manager.expect(`/catalog/menu-schedules/${schedule.id}`, 'PATCH', {
    ...scheduleBody,
    version: schedule.version,
    status: 'ARCHIVED',
  });
  expect((await preview()).suggestions).toHaveLength(1);
  const current = (await manager.expect(`/catalog/upsell-rules/${rule.id}`)).rule;
  await manager.expect(`/catalog/upsell-rules/${rule.id}`, 'PATCH', {
    version: current.version,
    name: current.name,
    sortOrder: current.sortOrder,
    status: 'ARCHIVED',
  });
  expect((await preview()).suggestions).toEqual([]);
  expect((await manager.expect(`/catalog/upsell-rules?locationId=${a.location.id}`)).rules).toEqual(
    [],
  );
  expect(
    (await manager.expect(`/catalog/upsell-rules?locationId=${a.location.id}&includeArchived=true`))
      .rules,
  ).toHaveLength(1);
});
