import { randomUUID } from 'node:crypto';
import { expect } from 'vitest';
import type { InventoryFixture } from './inventory.types';
import { db, noSecrets } from './support/harness';

export async function verifyInventoryConsumption(f: InventoryFixture) {
  const primary = f.a.primary;
  expect((await primary.expect(`/inventory/recipes/${f.product.id}`)).recipe).toBeNull();
  await primary.expect(`/inventory/recipes/${f.product.id}`, 'POST', f.recipe());
  const order = (
    await primary.expect(
      '/orders',
      'POST',
      f.draft({
        serviceType: 'TAKEAWAY',
        tableLabel: undefined,
        items: [{ productId: f.product.id, quantity: '1.234' }],
      }),
    )
  ).order;
  const body = { version: 1, requestKey: randomUUID() };
  const [sent, replay] = await Promise.all([
    primary.expect(`/orders/${order.id}/send`, 'POST', body),
    primary.expect(`/orders/${order.id}/send`, 'POST', body),
  ]);
  expect(sent.ticket.id).toBe(replay.ticket.id);
  const pending = await f.stored(order.id);
  expect(pending.reservation?.status).toBe('PENDING');
  expect(pending.documents).toHaveLength(0);
  expect(pending.movements).toHaveLength(0);
  expect(pending.lines).toHaveLength(4);
  expect(
    Object.fromEntries(
      pending.lines.map((line) => [line.inventoryItemId, line.quantity.toFixed(6)]),
    ),
  ).toEqual({
    [f.main.id]: '3.085000',
    [f.auxiliary.id]: '0.410922',
    [f.packaging.id]: '1.234000',
    [f.consumable.id]: '0.617000',
  });
  expect(
    (await primary.expect(`/inventory/items/${f.auxiliary.id}?locationId=${f.a.location.id}`)).item,
  ).toMatchObject({
    balance: '0.000000',
    reservedQuantity: '0.410922',
    availableQuantity: '-0.410922',
  });
  const dine = await f.send();
  expect(
    (await f.stored(dine.order.id)).lines.some((line) => line.inventoryItemId === f.packaging.id),
  ).toBe(false);
  await f.finish(dine.order.id, dine.ticket.id);
  const empty = await f.send({ items: [{ productId: f.secondProduct.id, quantity: '1' }] });
  expect(await f.stored(empty.order.id)).toMatchObject({
    reservation: { status: 'PENDING' },
    documents: [],
    lines: [],
  });
  await f.finish(empty.order.id, empty.ticket.id);
  const ready = await f.ready(order.id, sent.ticket.id);
  const checkout = { version: ready.version, requestKey: randomUUID() };
  const [finalized, repeated] = await Promise.all([
    primary.expect(`/orders/${order.id}/checkout/demo`, 'POST', checkout),
    primary.expect(`/orders/${order.id}/checkout/demo`, 'POST', checkout),
  ]);
  expect(finalized.receipt.id).toBe(repeated.receipt.id);
  const stock = await f.stored(order.id);
  expect(stock.reservation?.status).toBe('CONSUMED');
  expect(stock.documents).toHaveLength(1);
  expect(stock.movements).toHaveLength(4);
  for (const line of pending.lines) {
    expect(
      stock.movements
        .find((entry) => entry.recipeComponentId === line.recipeComponentId)
        ?.quantity.toFixed(6),
    ).toBe(`-${line.quantity.toFixed(6)}`);
  }
  const audits = await db.withTenantTransaction(
    db.runtime,
    { organizationId: f.a.company.organization.id },
    (tx) =>
      tx.auditEvent.count({
        where: { action: 'inventory.consumption', targetId: stock.documents[0]!.id },
      }),
  );
  expect(audits).toBe(1);
  expect(
    (await primary.expect(`/inventory/items/${f.auxiliary.id}?locationId=${f.a.location.id}`)).item,
  ).toMatchObject({
    balance: '-0.821844',
    reservedQuantity: '0.000000',
    availableQuantity: '-0.821844',
  });
  const ledger = await primary.expect(
    `/inventory/movements?locationId=${f.a.location.id}&kind=CONSUMPTION`,
  );
  expect(
    ledger.movements.find((movement: { id: string }) => movement.id === stock.movements[0]!.id)
      .document,
  ).toMatchObject({
    orderId: order.id,
    orderNumber: order.number,
    actorName: 'Administrator sintetic',
  });
  noSecrets(ledger);
  expect(JSON.stringify(sent.ticket)).not.toMatch(/inventory|recipe|unitPrice|lineTotal/);
}

export async function verifyInventoryRecipes(f: InventoryFixture) {
  const primary = f.a.primary;
  const recipes = await f.login('recipes');
  const body = f.recipe();
  const responses = await Promise.all([
    recipes.expect(`/inventory/recipes/${f.secondProduct.id}`, 'POST', body),
    recipes.expect(`/inventory/recipes/${f.secondProduct.id}`, 'POST', body),
  ]);
  expect(responses[0].recipe).toEqual(responses[1].recipe);
  expect(
    (
      await recipes.call(`/inventory/recipes/${f.secondProduct.id}`, 'POST', {
        ...body,
        reason: 'Alte date',
      })
    ).status,
  ).toBe(409);
  expect(
    (await recipes.call(`/inventory/recipes/${f.secondProduct.id}`, 'POST', f.recipe())).status,
  ).toBe(409);
  expect(
    (
      await recipes.call(
        `/inventory/recipes/${f.secondProduct.id}`,
        'POST',
        f.recipe({
          expectedVersion: 1,
          components: [
            {
              inventoryItemId: f.packaging.id,
              purpose: 'MAIN',
              quantityPerUnit: '1',
              serviceTypes: ['TAKEAWAY'],
            },
          ],
        }),
      )
    ).status,
  ).toBe(400);
  await primary.expect(`/inventory/items/${f.main.id}`, 'PATCH', {
    version: 1,
    name: 'Ingredient redenumit',
    status: 'ARCHIVED',
  });
  const archived = await f.send({ items: [{ productId: f.secondProduct.id, quantity: '1' }] });
  expect(
    (await f.stored(archived.order.id)).lines.find(
      (movement) => movement.inventoryItemId === f.main.id,
    ),
  ).toMatchObject({ itemName: 'Ingredient redenumit' });
  expect(
    (
      await recipes.call(
        `/inventory/recipes/${f.secondProduct.id}`,
        'POST',
        f.recipe({ expectedVersion: 1 }),
      )
    ).status,
  ).toBe(409);
  const disabled = await recipes.expect(
    `/inventory/recipes/${f.secondProduct.id}`,
    'POST',
    f.recipe({ expectedVersion: 1, components: [], reason: 'Rețetă dezactivată explicit' }),
  );
  expect(disabled.recipe).toMatchObject({ version: 2, components: [] });
  const newer = await f.send({ items: [{ productId: f.secondProduct.id, quantity: '1' }] });
  expect((await f.stored(newer.order.id)).lines).toHaveLength(0);
  expect((await f.stored(archived.order.id)).lines).toHaveLength(3);
  const ready = await f.ready(archived.order.id, archived.ticket.id);
  await primary.expect(`/orders/${archived.order.id}/checkout/manual`, 'POST', {
    version: ready.version,
    requestKey: randomUUID(),
    method: 'CARD',
    cashShiftId: (await f.cashShift()).id,
    confirmed: true,
  });
  await f.finish(newer.order.id, newer.ticket.id);
  expect((await f.stored(archived.order.id)).movements).toHaveLength(3);
  const versions = await db.withTenantTransaction(
    db.runtime,
    { organizationId: f.a.company.organization.id },
    (tx) => tx.recipeVersion.count({ where: { productId: f.secondProduct.id } }),
  );
  expect(versions).toBe(2);
}
