import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { closeOperations, prepareOperations } from './api/operations-setup';
import type { OperationsFixture } from './api/operations.types';

let fixture: OperationsFixture;
beforeAll(async () => {
  fixture = await prepareOperations();
});
afterAll(async () => {
  if (fixture) await closeOperations(fixture.owner.id);
});

it('rechecks current product, binding and selected option before send while retaining the quote', async () => {
  const { a, product, worker, draft } = fixture;
  const group = (
    await a.primary.expect('/catalog/modifier-groups', 'POST', {
      name: 'Adaos la trimitere',
      minSelections: 0,
      maxSelections: 1,
    })
  ).modifierGroup;
  const option = (
    await a.primary.expect(`/catalog/modifier-groups/${group.id}/options`, 'POST', {
      name: 'Adaos original',
      extraPrice: '0.1000',
    })
  ).modifierOption;
  const binding = (
    await a.primary.expect(`/catalog/products/${product.id}/modifier-groups`, 'POST', {
      modifierGroupId: group.id,
    })
  ).modifierGroup;
  await a.primary.expect(`/inventory/modifier-recipes/${product.id}/${option.id}`, 'POST', {
    expectedVersion: 0,
    requestKey: randomUUID(),
    reason: 'Fără consum în test',
    components: [],
  });
  const order = (
    await worker.expect(
      '/orders',
      'POST',
      draft({
        items: [
          {
            productId: product.id,
            quantity: '1',
            modifiers: [
              {
                bindingId: binding.id,
                bindingVersion: binding.version,
                groupVersion: binding.group.version,
                optionIds: [option.id],
              },
            ],
          },
        ],
      }),
    )
  ).order;
  const send = () =>
    worker.call(`/orders/${order.id}/send`, 'POST', {
      version: order.version,
      requestKey: randomUUID(),
    });
  const assertRejected = async () => {
    expect((await send()).status).toBe(409);
    expect((await worker.expect(`/orders/${order.id}`)).order).toMatchObject({
      status: 'DRAFT',
      version: order.version,
    });
    expect(
      (await worker.expect(`/kitchen/tickets?locationId=${a.location.id}`)).tickets,
    ).toHaveLength(0);
  };
  const archived = (
    await a.primary.expect(`/catalog/modifier-groups/${group.id}/options/${option.id}`, 'PATCH', {
      version: option.version,
      status: 'ARCHIVED',
    })
  ).modifierOption;
  await assertRejected();
  await a.primary.expect(`/catalog/modifier-groups/${group.id}/options/${option.id}`, 'PATCH', {
    version: archived.version,
    status: 'ACTIVE',
    name: 'Adaos ulterior',
    extraPrice: '1.5000',
  });
  const detached = (
    await a.primary.expect(
      `/catalog/products/${product.id}/modifier-groups/${binding.id}`,
      'PATCH',
      {
        version: binding.version,
        status: 'ARCHIVED',
      },
    )
  ).modifierGroup;
  await assertRejected();
  await a.primary.expect(`/catalog/products/${product.id}/modifier-groups/${binding.id}`, 'PATCH', {
    version: detached.version,
    status: 'ACTIVE',
  });
  const local = (
    await a.primary.expect(`/catalog/products/${product.id}/locations/${a.location.id}`, 'PUT', {
      version: product.locationVersion,
      enabled: false,
      price: '50.0000',
    })
  ).product;
  await assertRejected();
  await a.primary.expect(`/catalog/products/${product.id}/locations/${a.location.id}`, 'PUT', {
    version: local.locationVersion,
    enabled: true,
    price: '50.0000',
  });
  const sent = await send();
  expect(sent.status).toBe(200);
  expect(sent.data.order).toMatchObject({ status: 'CONFIRMED', total: '10.11' });
  expect(sent.data.ticket.items[0].modifierGroups[0].options[0]).toMatchObject({
    optionName: 'Adaos original',
    extraPrice: '0.1000',
  });
});
