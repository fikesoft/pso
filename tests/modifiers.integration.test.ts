import { completePacking } from './api/complete-packing';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { closeOperations, prepareOperations } from './api/operations-setup';
import type { OperationsFixture } from './api/operations.types';

let fixture: OperationsFixture;
let group: any;
let small: any;
let large: any;
let binding: any;
let completedOrderId = '';
let originalSnapshots: any[] = [];

const groupsUrl = '/catalog/modifier-groups';

beforeAll(async () => {
  fixture = await prepareOperations();
  group = (
    await fixture.a.primary.expect(groupsUrl, 'POST', {
      name: 'Mărime',
      minSelections: 1,
      maxSelections: 2,
      sortOrder: 2,
    })
  ).modifierGroup;
  small = (
    await fixture.a.primary.expect(`${groupsUrl}/${group.id}/options`, 'POST', {
      name: 'Mică',
      extraPrice: '0.1234',
      sortOrder: 1,
    })
  ).modifierOption;
  large = (
    await fixture.a.primary.expect(`${groupsUrl}/${group.id}/options`, 'POST', {
      name: 'Mare',
      extraPrice: '2.1250',
      sortOrder: 2,
    })
  ).modifierOption;
  binding = (
    await fixture.a.primary.expect(
      `/catalog/products/${fixture.product.id}/modifier-groups`,
      'POST',
      { modifierGroupId: group.id },
    )
  ).modifierGroup;
});
afterAll(async () => {
  if (fixture) await closeOperations(fixture.owner.id);
});

it('bounds catalog reads, versions, options and tenant writes', async () => {
  const { a, b, worker, manager, product } = fixture;
  const url = `${groupsUrl}?locationId=${a.location.id}`;
  const own = await worker.expect(url);
  expect(own.modifierGroups.find((item: any) => item.id === group.id)).toMatchObject({
    required: true,
    minSelections: 1,
    maxSelections: 2,
  });
  expect(
    (await worker.expect(`/catalog/products/${product.id}?locationId=${a.location.id}`)).product
      .modifierGroups[0].id,
  ).toBe(binding.id);
  expect(
    (await manager.call(groupsUrl, 'POST', { name: 'Local', minSelections: 0, maxSelections: 1 }))
      .status,
  ).toBe(403);
  expect(
    (await b.primary.call(`${groupsUrl}/${group.id}`, 'PATCH', { version: 1, name: 'Străin' }))
      .status,
  ).toBe(404);
  expect((await b.primary.call(`${url}&includeArchived=true`)).status).toBe(403);
  expect((await worker.call(`${url}&includeArchived=true`)).status).toBe(403);
  expect(
    (await a.primary.call(`${groupsUrl}/${group.id}`, 'PATCH', { version: 1, name: 'Vechi' }))
      .status,
  ).toBe(409);
  expect(
    (
      await a.primary.call(`${groupsUrl}/${group.id}`, 'PATCH', {
        version: binding.group.version,
        status: 'ARCHIVED',
      })
    ).status,
  ).toBe(409);
  const options = await a.primary.expect(
    `${groupsUrl}/${group.id}/options?locationId=${a.location.id}&limit=1&includeArchived=true`,
  );
  expect(options.modifierOptions).toHaveLength(1);
  expect(options.nextCursor).toBeTruthy();
  expect(
    (
      await a.primary.expect(
        `${groupsUrl}/${group.id}/options/${large.id}?locationId=${a.location.id}&includeArchived=true`,
      )
    ).modifierOption.id,
  ).toBe(large.id);
});

it('validates selected versions and immutable prices, and replays canonical order requests', async () => {
  const { a, worker, product } = fixture;
  const fresh = (await worker.expect(`/catalog/products/${product.id}?locationId=${a.location.id}`))
    .product.modifierGroups[0];
  const selection = {
    bindingId: fresh.id,
    bindingVersion: fresh.version,
    groupVersion: fresh.group.version,
    optionIds: [large.id, small.id],
  };
  const base = fixture.draft({
    items: [{ productId: product.id, quantity: '2', modifiers: [selection] }],
  });
  expect(
    (
      await worker.call(
        '/orders',
        'POST',
        fixture.draft({ items: [{ productId: product.id, quantity: '1' }] }),
      )
    ).status,
  ).toBe(400);
  expect(
    (
      await worker.call(
        '/orders',
        'POST',
        fixture.draft({
          items: [
            {
              productId: product.id,
              quantity: '1',
              modifiers: [{ ...selection, groupVersion: 1 }],
            },
          ],
        }),
      )
    ).status,
  ).toBe(409);
  const order = (await worker.expect('/orders', 'POST', base)).order;
  expect(order.items[0]).toMatchObject({
    baseUnitPrice: '10.0050',
    unitPrice: '12.2534',
    lineTotal: '24.51',
    modifierGroups: [
      {
        groupName: 'Mărime',
        options: [
          { optionName: 'Mică', extraPrice: '0.1234' },
          { optionName: 'Mare', extraPrice: '2.1250' },
        ],
      },
    ],
  });
  const replay = (
    await worker.expect('/orders', 'POST', {
      ...base,
      items: [
        {
          productId: product.id,
          quantity: '2',
          modifiers: [{ ...selection, optionIds: [small.id, large.id] }],
        },
      ],
    })
  ).order;
  expect(replay.id).toBe(order.id);
  expect(
    (
      await worker.call('/orders', 'POST', {
        ...base,
        items: [{ productId: product.id, quantity: '1', modifiers: [selection] }],
      })
    ).status,
  ).toBe(409);
  const updated = (
    await worker.expect(`/orders/${order.id}`, 'PATCH', {
      version: order.version,
      serviceType: 'DINE_IN',
      tableLabel: '7',
      items: [{ id: order.items[0].id, productId: product.id, quantity: '3' }],
    })
  ).order;
  expect(updated.items[0].unitPrice).toBe('12.2534');
  expect(updated.items[0].modifierGroups).toEqual(order.items[0].modifierGroups);
  expect(
    (
      await worker.call(`/orders/${order.id}`, 'PATCH', {
        version: updated.version,
        serviceType: 'DINE_IN',
        tableLabel: '7',
        items: [
          { id: order.items[0].id, productId: product.id, quantity: '3', modifiers: [selection] },
        ],
      })
    ).status,
  ).toBe(400);
  expect(
    (
      await worker.call(`/orders/${order.id}/send`, 'POST', {
        version: updated.version,
        requestKey: randomUUID(),
      })
    ).status,
  ).toBe(409);
  for (const option of [small, large]) {
    await a.primary.expect(`/inventory/modifier-recipes/${product.id}/${option.id}`, 'POST', {
      expectedVersion: 0,
      requestKey: randomUUID(),
      reason: 'Fără consum de stoc pentru această alegere',
      components: [],
    });
  }
  const ticket = (
    await worker.expect(`/orders/${order.id}/send`, 'POST', {
      version: updated.version,
      requestKey: randomUUID(),
    })
  ).ticket;
  expect(ticket.items[0].modifierGroups).toEqual(order.items[0].modifierGroups);
  await a.primary.expect(`/kitchen/tickets/${ticket.id}`, 'PATCH', {
    version: ticket.version,
    status: 'PREPARING',
  });
  await a.primary.expect(`/kitchen/tickets/${ticket.id}`, 'PATCH', {
    version: ticket.version + 1,
    status: 'READY',
  });
  const ready = await completePacking(a.primary, order.id);
  const completed = await worker.expect(`/orders/${order.id}/checkout/demo`, 'POST', {
    version: ready.version,
    requestKey: randomUUID(),
  });
  expect(completed.receipt.items[0].modifierGroups).toEqual(order.items[0].modifierGroups);
  completedOrderId = order.id;
  originalSnapshots = order.items[0].modifierGroups;
});

it('archives catalog options while preserving prior order snapshots', async () => {
  const { a, product } = fixture;
  const archived = (
    await a.primary.expect(`${groupsUrl}/${group.id}/options/${large.id}`, 'PATCH', {
      version: large.version,
      status: 'ARCHIVED',
    })
  ).modifierOption;
  expect(archived.status).toBe('ARCHIVED');
  const current = (
    await a.primary.expect(`/catalog/products/${product.id}?locationId=${a.location.id}`)
  ).product.modifierGroups[0];
  expect(current.group.options.map((option: any) => option.id)).toEqual([small.id]);
  expect(
    (
      await a.primary.call(`${groupsUrl}/${group.id}/options/${small.id}`, 'PATCH', {
        version: small.version,
        status: 'ARCHIVED',
      })
    ).status,
  ).toBe(409);
  expect(
    (
      await a.primary.expect(
        `${groupsUrl}/${group.id}/options/${large.id}?locationId=${a.location.id}&includeArchived=true`,
      )
    ).modifierOption.status,
  ).toBe('ARCHIVED');
  expect(
    (await a.primary.expect(`/orders/${completedOrderId}/receipt`)).receipt.items[0].modifierGroups,
  ).toEqual(originalSnapshots);
});
