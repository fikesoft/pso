import { randomUUID } from 'node:crypto';
import { expect } from 'vitest';
import type { InventoryFixture } from './inventory.types';

export async function verifyInventoryCapacity(f: InventoryFixture) {
  const primary = f.a.primary;
  const components = [];
  for (let index = 0; index < 50; index++) {
    const item = await f.createItem(`Componentă de capacitate ${index + 1}`);
    components.push({
      inventoryItemId: item.id,
      purpose: 'MAIN',
      quantityPerUnit: '0.001',
      serviceTypes: ['DINE_IN'],
    });
  }
  const product = (
    await primary.expect('/catalog/products', 'POST', {
      locationId: f.a.location.id,
      name: 'Produs cu 50 componente',
      sku: randomUUID(),
      price: '0',
    })
  ).product;
  await primary.expect(`/inventory/recipes/${product.id}`, 'POST', f.recipe({ components }));
  const group = (
    await primary.expect('/catalog/modifier-groups', 'POST', {
      name: 'Capacitate suplimentară',
      minSelections: 0,
      maxSelections: 1,
      sortOrder: 1,
    })
  ).modifierGroup;
  const option = (
    await primary.expect(`/catalog/modifier-groups/${group.id}/options`, 'POST', {
      name: 'O componentă în plus',
      extraPrice: '0.0000',
      sortOrder: 1,
    })
  ).modifierOption;
  await primary.expect(`/catalog/products/${product.id}/modifier-groups`, 'POST', {
    modifierGroupId: group.id,
  });
  await primary.expect(`/inventory/modifier-recipes/${product.id}/${option.id}`, 'POST', {
    expectedVersion: 0,
    requestKey: randomUUID(),
    reason: 'Componentă suplimentară pentru testul limitei',
    components: [components[0]],
  });
  const binding = (
    await primary.expect(`/catalog/products/${product.id}?locationId=${f.a.location.id}`)
  ).product.modifierGroups[0];
  const selection = {
    bindingId: binding.id,
    bindingVersion: binding.version,
    groupVersion: binding.group.version,
    optionIds: [option.id],
  };
  const oversized = (
    await primary.expect(
      '/orders',
      'POST',
      f.draft({
        items: Array.from({ length: 50 }, (_, index) => ({
          productId: product.id,
          quantity: '1',
          ...(index === 0 ? { modifiers: [selection] } : {}),
        })),
      }),
    )
  ).order;
  expect(
    (
      await primary.call(`/orders/${oversized.id}/send`, 'POST', {
        version: oversized.version,
        requestKey: randomUUID(),
      })
    ).status,
  ).toBe(413);
  expect((await f.stored(oversized.id)).reservation).toBeNull();
  const order = (
    await primary.expect(
      '/orders',
      'POST',
      f.draft({
        items: Array.from({ length: 50 }, () => ({ productId: product.id, quantity: '1' })),
      }),
    )
  ).order;
  const body = { version: 1, requestKey: randomUUID() };
  const results = await Promise.all([
    primary.expect(`/orders/${order.id}/send`, 'POST', body),
    primary.expect(`/orders/${order.id}/send`, 'POST', body),
  ]);
  expect(results[0].ticket.id).toBe(results[1].ticket.id);
  const pending = await f.stored(order.id);
  expect(pending.documents).toHaveLength(0);
  expect(pending.lines).toHaveLength(2500);
  const pendingItem = await primary.expect(
    `/inventory/items/${components[0]!.inventoryItemId}?locationId=${f.a.location.id}`,
  );
  expect(pendingItem.item).toMatchObject({
    balance: '0.000000',
    reservedQuantity: '0.050000',
    availableQuantity: '-0.050000',
  });
  await f.finish(order.id, results[0].ticket.id);
  const stored = await f.stored(order.id);
  expect(stored.documents).toHaveLength(1);
  expect(stored.movements).toHaveLength(2500);
  for (const movement of stored.movements) expect(movement.quantity.toFixed(6)).toBe('-0.001000');
  const item = await primary.expect(
    `/inventory/items/${components[0]!.inventoryItemId}?locationId=${f.a.location.id}`,
  );
  expect(item.item.balance).toBe('-0.050000');
}
