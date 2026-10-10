import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { prepareOperations, closeOperations } from './api/operations-setup';
let f: Awaited<ReturnType<typeof prepareOperations>>;
beforeAll(async () => {
  f = await prepareOperations();
}, 60_000);
afterAll(async () => {
  if (f) await closeOperations(f.owner.id);
});

async function send(items: Array<Record<string, unknown>>, locationId = f.a.location.id) {
  const { order } = await f.a.primary.expect('/orders', 'POST', f.draft({ locationId, items }));
  return f.a.primary.expect(`/orders/${order.id}/send`, 'POST', {
    version: order.version,
    requestKey: randomUUID(),
  });
}
function path(ticket: { id: string; items: Array<{ id: string }> }, index = 0) {
  return `/kitchen/tickets/${ticket.id}/items/${ticket.items[index]!.id}/recipe`;
}

it('rețeta KDS păstrează cantitățile și numele rezervate, cu versiune istorică și fără informații comerciale', async () => {
  const { item } = await f.a.primary.expect('/inventory/items', 'POST', {
    name: 'Ingredient istoric',
    sku: 'KDS-HIST',
    kind: 'INGREDIENT',
    unit: 'G',
  });
  const { item: packaging } = await f.a.primary.expect('/inventory/items', 'POST', {
    name: 'Ambalaj extern',
    sku: 'KDS-PACK',
    kind: 'PACKAGING',
    unit: 'PCS',
  });
  const recipePath = `/inventory/recipes/${f.product.id}`;
  await f.a.primary.expect(recipePath, 'POST', {
    expectedVersion: 0,
    requestKey: randomUUID(),
    reason: 'Rețetă sintetică',
    components: [
      {
        inventoryItemId: item.id,
        purpose: 'MAIN',
        quantityPerUnit: '2.333',
        serviceTypes: ['DINE_IN', 'PICKUP'],
      },
      {
        inventoryItemId: packaging.id,
        purpose: 'PACKAGING',
        quantityPerUnit: '1',
        serviceTypes: ['PICKUP'],
      },
    ],
  });
  const { ticket } = await send([{ productId: f.product.id, quantity: '1.234' }]);
  const result = await f.cook.expect(path(ticket));
  expect(result).toMatchObject({
    ticketId: ticket.id,
    ticketItemId: ticket.items[0].id,
    quantity: '1.234',
    status: 'AVAILABLE',
  });
  expect(result.components).toEqual([
    {
      id: expect.any(String),
      itemName: 'Ingredient istoric',
      unit: 'G',
      purpose: 'MAIN',
      quantityPerUnit: '2.333',
      totalQuantity: '2.878922',
      recipeVersion: 1,
      source: 'BASE',
      modifierName: null,
    },
  ]);
  expect(Object.keys(result).sort()).toEqual([
    'components',
    'productName',
    'quantity',
    'status',
    'ticketId',
    'ticketItemId',
  ]);
  expect((await f.cook.call(recipePath)).status).toBe(403);
  await f.a.primary.expect(`/inventory/items/${item.id}`, 'PATCH', {
    version: item.version,
    name: 'Nume nou',
    status: 'ARCHIVED',
  });
  await f.a.primary.expect(recipePath, 'POST', {
    expectedVersion: 1,
    requestKey: randomUUID(),
    reason: 'Versiune goală',
    components: [],
  });
  expect(await f.cook.expect(path(ticket))).toEqual(result);
  const fresh = await send([{ productId: f.product.id, quantity: '1' }]);
  expect(await f.cook.expect(path(fresh.ticket))).toMatchObject({
    status: 'NO_COMPONENTS',
    components: [],
  });
  expect((await f.b.primary.call(path(ticket))).status).toBe(404);
  expect((await f.manager.call(path(ticket))).status).toBe(403);
  expect(
    (await f.cook.call(`/kitchen/tickets/${fresh.ticket.id}/items/${ticket.items[0].id}/recipe`))
      .status,
  ).toBe(404);
  await f.a.primary.expect(
    `/catalog/products/${f.product.id}/locations/${f.otherLocation.id}`,
    'PUT',
    { price: '10', enabled: true },
  );
  const other = await send([{ productId: f.product.id, quantity: '1' }], f.otherLocation.id);
  expect((await f.cook.call(path(other.ticket))).status).toBe(403);
});

it('componentele modificatorului folosesc numele selectat și propria versiune imuabilă', async () => {
  const { item } = await f.a.primary.expect('/inventory/items', 'POST', {
    name: 'Adaos sintetic',
    sku: 'KDS-EXTRA',
    kind: 'INGREDIENT',
    unit: 'ML',
  });
  const { modifierGroup: group } = await f.a.primary.expect('/catalog/modifier-groups', 'POST', {
    name: 'Adaosuri KDS',
    minSelections: 0,
    maxSelections: 1,
    sortOrder: 0,
  });
  const { modifierOption: option } = await f.a.primary.expect(
    `/catalog/modifier-groups/${group.id}/options`,
    'POST',
    { name: 'Extra sos', extraPrice: '5', sortOrder: 0 },
  );
  await f.a.primary.expect(`/catalog/products/${f.secondProduct.id}/modifier-groups`, 'POST', {
    modifierGroupId: group.id,
  });
  await f.a.primary.expect(
    `/inventory/modifier-recipes/${f.secondProduct.id}/${option.id}`,
    'POST',
    {
      expectedVersion: 0,
      requestKey: randomUUID(),
      reason: 'Adaos pentru preparare',
      components: [
        {
          inventoryItemId: item.id,
          purpose: 'AUXILIARY',
          quantityPerUnit: '0.125',
          serviceTypes: ['DINE_IN'],
        },
      ],
    },
  );
  const { product } = await f.a.primary.expect(
    `/catalog/products/${f.secondProduct.id}?locationId=${f.a.location.id}`,
  );
  const binding = product.modifierGroups[0];
  const { ticket } = await send([
    {
      productId: f.secondProduct.id,
      quantity: '2.5',
      modifiers: [
        {
          bindingId: binding.id,
          bindingVersion: binding.version,
          groupVersion: binding.group.version,
          optionIds: [option.id],
        },
      ],
    },
  ]);
  const result = await f.cook.expect(path(ticket));
  expect(result.components).toEqual([
    {
      id: expect.any(String),
      itemName: 'Adaos sintetic',
      unit: 'ML',
      purpose: 'AUXILIARY',
      quantityPerUnit: '0.125',
      totalQuantity: '0.312500',
      recipeVersion: 1,
      source: 'MODIFIER',
      modifierName: 'Extra sos',
    },
  ]);
  await f.a.primary.expect(
    `/inventory/modifier-recipes/${f.secondProduct.id}/${option.id}`,
    'POST',
    { expectedVersion: 1, requestKey: randomUUID(), reason: 'Adaos retras', components: [] },
  );
  expect(await f.cook.expect(path(ticket))).toEqual(result);
});
