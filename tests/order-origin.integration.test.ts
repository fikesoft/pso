import { createHash, randomUUID } from 'node:crypto';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { prepareInventory } from './api/inventory-setup';
import type { InventoryFixture } from './api/inventory.types';
import { closeOperations } from './api/operations-setup';
import { db } from './api/support/harness';

let f: InventoryFixture;
beforeAll(async () => {
  f = await prepareInventory();
});
afterAll(async () => {
  if (f) await closeOperations(f.owner.id);
});

it('captures source and brand once, preserves legacy POS retry hashes and rejects caller-controlled provenance', async () => {
  const primary = f.a.primary;
  const legacy = f.draft();
  const unknown = (await primary.expect('/orders', 'POST', legacy)).order;
  expect(unknown).toMatchObject({ source: 'POS', brandId: null });
  // Freeze the original schema's serialization, before source existed in the request contract.
  const originalHash = createHash('sha256')
    .update(
      JSON.stringify({
        serviceType: legacy.serviceType,
        tableLabel: legacy.tableLabel,
        notes: legacy.notes,
        locationId: legacy.locationId,
        items: legacy.items,
        requestKey: legacy.requestKey,
      }),
    )
    .digest('hex');
  const stored = await db.withTenantTransaction(
    db.runtime,
    {
      organizationId: f.a.company.organization.id,
    },
    (tx) => tx.order.findUniqueOrThrow({ where: { id: unknown.id } }),
  );
  expect(stored.creationRequestHash).toBe(originalHash);
  expect((await primary.expect('/orders', 'POST', { ...legacy, source: 'POS' })).order.id).toBe(
    unknown.id,
  );
  const brand = (await primary.expect('/brands', 'POST', { name: 'Brand origine', code: 'ORIG' }))
    .brand;
  const assigned = (
    await primary.expect(`/locations/${f.a.location.id}`, 'PATCH', {
      version: f.a.location.version,
      brandId: brand.id,
    })
  ).location;
  const body = f.draft({ source: 'PHONE', serviceType: 'PICKUP', tableLabel: undefined });
  const order = (await primary.expect('/orders', 'POST', body)).order;
  expect(order).toMatchObject({ source: 'PHONE', brandId: brand.id, serviceType: 'PICKUP' });
  expect((await primary.expect('/orders', 'POST', body)).order.id).toBe(order.id);
  expect((await primary.call('/orders', 'POST', { ...body, source: 'WAITER' })).status).toBe(409);
  for (const change of [{ source: 'WEB' }, { source: 'QR' }, { brandId: brand.id }]) {
    expect((await primary.call('/orders', 'POST', f.draft(change))).status).toBe(400);
  }
  await primary.expect(`/locations/${f.a.location.id}`, 'PATCH', {
    version: assigned.version,
    brandId: null,
  });
  expect((await primary.expect(`/orders/${order.id}`)).order.brandId).toBe(brand.id);
  expect((await primary.expect(`/orders/${unknown.id}`)).order.brandId).toBeNull();
  const newer = (await primary.expect('/orders', 'POST', f.draft({ source: 'WAITER' }))).order;
  expect(newer).toMatchObject({ source: 'WAITER', brandId: null });
  expect((await f.b.primary.call(`/orders/${order.id}`)).status).toBe(404);
  const edit = {
    version: order.version,
    serviceType: 'PICKUP',
    items: order.items.map((item: { id: string; productId: string; quantity: string }) => ({
      id: item.id,
      productId: item.productId,
      quantity: item.quantity,
    })),
  };
  expect(
    (await primary.call(`/orders/${order.id}`, 'PATCH', { ...edit, source: 'POS' })).status,
  ).toBe(400);
  expect((await primary.expect(`/orders/${order.id}`, 'PATCH', edit)).order).toMatchObject({
    source: 'PHONE',
    brandId: brand.id,
  });
});

it('reserves PICKUP packaging at send, consumes it only at completion and excludes other service types', async () => {
  const primary = f.a.primary;
  await primary.expect(
    `/inventory/recipes/${f.product.id}`,
    'POST',
    f.recipe({
      components: [
        {
          inventoryItemId: f.packaging.id,
          purpose: 'PACKAGING',
          quantityPerUnit: '1',
          serviceTypes: ['PICKUP'],
        },
      ],
    }),
  );
  const sent = await f.send({
    source: 'PHONE',
    serviceType: 'PICKUP',
    tableLabel: undefined,
    items: [{ productId: f.product.id, quantity: '2' }],
  });
  expect(sent.ticket.serviceType).toBe('PICKUP');
  const pending = await f.stored(sent.order.id);
  expect(pending.reservation?.status).toBe('PENDING');
  expect(pending.movements).toHaveLength(0);
  expect(pending.lines).toHaveLength(1);
  expect(pending.lines[0]!.quantity.toFixed(6)).toBe('2.000000');
  const balancePath = `/inventory/items/${f.packaging.id}?locationId=${f.a.location.id}`;
  expect((await primary.expect(balancePath)).item).toMatchObject({
    balance: '0.000000',
    reservedQuantity: '2.000000',
    availableQuantity: '-2.000000',
  });
  const dine = await f.send();
  expect((await f.stored(dine.order.id)).lines).toHaveLength(0);
  const ready = await f.ready(sent.order.id, sent.ticket.id);
  const checkout = {
    version: ready.version,
    requestKey: randomUUID(),
    method: 'CARD',
    cashShiftId: (await f.cashShift()).id,
    confirmed: true,
  };
  const paid = await primary.expect(`/orders/${sent.order.id}/checkout/manual`, 'POST', checkout);
  expect(paid.receipt.serviceType).toBe('PICKUP');
  expect(
    (await primary.expect(`/orders/${sent.order.id}/checkout/manual`, 'POST', checkout)).receipt.id,
  ).toBe(paid.receipt.id);
  const complete = await f.stored(sent.order.id);
  expect(complete.reservation?.status).toBe('CONSUMED');
  expect(complete.movements).toHaveLength(1);
  expect(complete.movements[0]!.quantity.toFixed(6)).toBe('-2.000000');
  expect((await primary.expect(balancePath)).item).toMatchObject({
    balance: '-2.000000',
    reservedQuantity: '0.000000',
    availableQuantity: '-2.000000',
  });
});
