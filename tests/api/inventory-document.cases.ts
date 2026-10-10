import { randomUUID } from 'node:crypto';
import { expect } from 'vitest';
import type { InventoryFixture } from './inventory.types';
import { db, noSecrets } from './support/harness';

export async function verifyInventoryDocuments(f: InventoryFixture) {
  const item = await f.createItem('Stoc pentru inventariere');
  const manager = await f.login('manager');
  const receipt = f.document(item.id, { quantity: '10.1' });
  const both = await Promise.all([
    manager.expect('/inventory/documents', 'POST', receipt),
    manager.expect('/inventory/documents', 'POST', { ...receipt, quantity: '10.100000' }),
  ]);
  expect(both[0].document.id).toBe(both[1].document.id);
  expect(both[0].balance).toBe('10.100000');
  expect(both[0].movements[0]).toMatchObject({
    quantity: '10.100000',
    itemName: item.name,
    unit: 'G',
    countedQuantity: null,
  });
  expect(
    (await manager.call('/inventory/documents', 'POST', { ...receipt, quantity: '20' })).status,
  ).toBe(409);
  const waste = await manager.expect(
    '/inventory/documents',
    'POST',
    f.document(item.id, { kind: 'WASTE', quantity: '0.2' }),
  );
  expect(waste.balance).toBe('9.900000');
  const count = f.document(item.id, { kind: 'COUNT', quantity: '8', expectedQuantity: '10.1' });
  const stale = await manager.call('/inventory/documents', 'POST', count);
  expect(stale.status).toBe(409);
  expect(stale.data.code).toBe('INVENTORY_COUNT_STALE');
  const corrected = { ...count, expectedQuantity: '9.9' };
  const counts = await Promise.all([
    manager.expect('/inventory/documents', 'POST', corrected),
    manager.expect('/inventory/documents', 'POST', corrected),
  ]);
  expect(counts[0].document.id).toBe(counts[1].document.id);
  expect(counts[0].balance).toBe('8.000000');
  expect(counts[0].movements[0]).toMatchObject({
    quantity: '-1.900000',
    countedQuantity: '8.000000',
  });
  await manager.expect('/inventory/documents', 'POST', f.document(item.id, { quantity: '1' }));
  const replay = await manager.expect('/inventory/documents', 'POST', corrected);
  expect(replay.document).toEqual(counts[0].document);
  expect(replay.balance).toBe('9.000000');
  const race = await Promise.all(
    ['6', '7'].map((quantity) =>
      manager.call(
        '/inventory/documents',
        'POST',
        f.document(item.id, { kind: 'COUNT', quantity, expectedQuantity: '9' }),
      ),
    ),
  );
  expect(race.map((response) => response.status).sort()).toEqual([200, 409]);
  const saved = await db.withTenantTransaction(
    db.runtime,
    { organizationId: f.a.company.organization.id },
    async (tx) => {
      const movements = await tx.inventoryMovement.findMany({
        where: { inventoryItemId: item.id },
      });
      return {
        movements,
        audits: await tx.auditEvent.count({
          where: {
            targetType: 'INVENTORY_DOCUMENT',
            targetId: { in: movements.map((movement) => movement.documentId) },
          },
        }),
      };
    },
  );
  expect(saved.movements).toHaveLength(5);
  expect(saved.audits).toBe(5);
  const snapshot = both[0].movements[0];
  await f.a.primary.expect(`/inventory/items/${item.id}`, 'PATCH', {
    version: 1,
    name: 'Denumire ulterioară',
  });
  expect(
    (await f.a.primary.call(`/inventory/items/${item.id}`, 'PATCH', { version: 1, name: 'Stale' }))
      .status,
  ).toBe(409);
  expect(
    (await f.a.primary.call(`/inventory/items/${item.id}`, 'PATCH', { version: 2, unit: 'ML' }))
      .status,
  ).toBe(400);
  const historical = await manager.expect(
    `/inventory/movements?locationId=${f.a.location.id}&inventoryItemId=${item.id}&kind=RECEIPT`,
  );
  expect(
    historical.movements.find((movement: { id: string }) => movement.id === snapshot.id),
  ).toEqual(snapshot);
  expect(
    (
      await manager.call(
        '/inventory/documents',
        'POST',
        f.document(item.id, { kind: 'COUNT', expectedQuantity: undefined }),
      )
    ).status,
  ).toBe(400);
  noSecrets(historical);
}

export async function verifyInventoryBounds(f: InventoryFixture) {
  const item = await f.createItem('Limite exacte');
  const maximum = '999999999999.999999';
  const primary = f.a.primary;
  expect(
    (
      await primary.expect(
        '/inventory/documents',
        'POST',
        f.document(item.id, { quantity: maximum }),
      )
    ).balance,
  ).toBe(maximum);
  expect(
    (
      await primary.call(
        '/inventory/documents',
        'POST',
        f.document(item.id, { quantity: '0.000001' }),
      )
    ).status,
  ).toBe(400);
  await primary.expect(
    '/inventory/documents',
    'POST',
    f.document(item.id, { kind: 'WASTE', quantity: maximum }),
  );
  await primary.expect(
    '/inventory/documents',
    'POST',
    f.document(item.id, { kind: 'WASTE', quantity: maximum }),
  );
  expect(
    (
      await primary.call(
        '/inventory/documents',
        'POST',
        f.document(item.id, { kind: 'WASTE', quantity: '0.000001' }),
      )
    ).status,
  ).toBe(400);
  expect(
    (
      await primary.call(
        '/inventory/documents',
        'POST',
        f.document(item.id, { kind: 'COUNT', quantity: maximum, expectedQuantity: `-${maximum}` }),
      )
    ).status,
  ).toBe(400);
  const product = (
    await primary.expect('/catalog/products', 'POST', {
      locationId: f.a.location.id,
      name: 'Produs pentru rollback',
      sku: randomUUID(),
      price: '1',
    })
  ).product;
  await primary.expect(
    `/inventory/recipes/${product.id}`,
    'POST',
    f.recipe({
      components: [
        {
          inventoryItemId: item.id,
          purpose: 'MAIN',
          quantityPerUnit: '0.001',
          serviceTypes: ['DINE_IN'],
        },
      ],
    }),
  );
  const draft = (
    await primary.expect(
      '/orders',
      'POST',
      f.draft({ items: [{ productId: product.id, quantity: '0.001' }] }),
    )
  ).order;
  const sent = await primary.expect(`/orders/${draft.id}/send`, 'POST', {
    version: 1,
    requestKey: randomUUID(),
  });
  const ready = await f.ready(draft.id, sent.ticket.id);
  const checkout = {
    version: ready.version,
    requestKey: randomUUID(),
    method: 'CARD',
    cashShiftId: (await f.cashShift()).id,
    confirmed: true,
  };
  const shiftPath = `/cash-shifts/${checkout.cashShiftId}?locationId=${f.a.location.id}`;
  const shiftBefore = await primary.expect(shiftPath);
  const failed = await primary.call(`/orders/${draft.id}/checkout/manual`, 'POST', checkout);
  expect(await primary.expect(shiftPath)).toEqual(shiftBefore);
  expect(failed.status).toBe(400);
  expect((await primary.expect(`/orders/${draft.id}`)).order).toMatchObject({
    status: 'READY',
    kitchenStatus: 'READY',
    version: ready.version,
  });
  const stored = await f.stored(draft.id);
  expect(stored.documents).toHaveLength(0);
  expect(stored.reservation?.status).toBe('PENDING');
  expect(stored.lines).toHaveLength(1);
  const finance = await db.withTenantTransaction(
    db.runtime,
    { organizationId: f.a.company.organization.id },
    async (tx) => ({
      checkouts: await tx.checkout.count({ where: { orderId: draft.id } }),
      payments: await tx.payment.count({ where: { orderId: draft.id } }),
    }),
  );
  expect(finance).toEqual({ checkouts: 0, payments: 0 });
  expect(
    (
      await primary.expect(
        '/inventory/documents',
        'POST',
        f.document(item.id, { kind: 'COUNT', quantity: '0', expectedQuantity: `-${maximum}` }),
      )
    ).balance,
  ).toBe('0.000000');
}
