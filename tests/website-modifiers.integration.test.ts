import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { closeOperations } from './api/operations-setup';
import { prepareWebsite } from './api/website-setup';
import type { WebsiteFixture } from './api/website.types';

let fixture: WebsiteFixture;
beforeAll(async () => {
  fixture = await prepareWebsite();
});
afterAll(async () => {
  if (fixture) await closeOperations(fixture.owner.id);
});

it('validates website choices and copies original prices, selected and empty groups on acceptance', async () => {
  const f = fixture;
  const primary = f.a.primary;
  const required = (
    await primary.expect('/catalog/modifier-groups', 'POST', {
      name: 'Mărime website',
      minSelections: 1,
      maxSelections: 1,
      sortOrder: 1,
    })
  ).modifierGroup;
  const option = (
    await primary.expect(`/catalog/modifier-groups/${required.id}/options`, 'POST', {
      name: 'Mare website',
      extraPrice: '2.1250',
      sortOrder: 1,
    })
  ).modifierOption;
  await primary.expect(`/catalog/products/${f.product.id}/modifier-groups`, 'POST', {
    modifierGroupId: required.id,
    sortOrder: 1,
  });
  const optional = (
    await primary.expect('/catalog/modifier-groups', 'POST', {
      name: 'Fără adaos',
      minSelections: 0,
      maxSelections: 1,
      sortOrder: 2,
    })
  ).modifierGroup;
  await primary.expect(`/catalog/products/${f.product.id}/modifier-groups`, 'POST', {
    modifierGroupId: optional.id,
    sortOrder: 2,
  });
  const catalog = await f.inbound('/catalog');
  expect(catalog.status).toBe(200);
  const product = catalog.data.products.find(
    (entry: { productId: string }) => entry.productId === f.product.id,
  );
  expect(product.modifierGroups).toHaveLength(2);
  const [requiredBinding, optionalBinding] = product.modifierGroups;
  const selected = {
    bindingId: requiredBinding.id,
    bindingVersion: requiredBinding.version,
    groupVersion: requiredBinding.group.version,
    optionIds: [option.id],
  };
  const empty = {
    bindingId: optionalBinding.id,
    bindingVersion: optionalBinding.version,
    groupVersion: optionalBinding.group.version,
    optionIds: [],
  };
  const body = f.order({
    expectedTotal: '12.13',
    items: [
      {
        externalProductId: f.product.sku,
        quantity: '1.000',
        modifiers: [empty, selected],
      },
    ],
  });
  expect(
    (
      await f.inbound('/orders', 'POST', {
        ...body,
        items: [
          {
            externalProductId: f.product.sku,
            quantity: '1.000',
            modifiers: [{ ...selected, bindingId: randomUUID() }, empty],
          },
        ],
      })
    ).status,
  ).toBe(409);
  const key = randomUUID();
  const received = await f.inbound('/orders', 'POST', body, key);
  expect(received.status, JSON.stringify(received.data)).toBe(200);
  expect(
    (
      await f.inbound(
        '/orders',
        'POST',
        {
          ...body,
          items: [
            {
              externalProductId: f.product.sku,
              quantity: '1',
              modifiers: [selected, empty],
            },
          ],
        },
        key,
      )
    ).data,
  ).toEqual(received.data);
  const receiptId = received.data.receipt.id;
  const detail = (await primary.expect(`/website/orders/${receiptId}`)).websiteOrder;
  expect(detail.items[0].modifierGroups).toMatchObject([
    {
      groupName: 'Mărime website',
      options: [{ optionName: 'Mare website', extraPrice: '2.1250' }],
    },
    { groupName: 'Fără adaos', options: [] },
  ]);
  const changed = (
    await primary.expect(`/catalog/modifier-groups/${required.id}/options/${option.id}`, 'PATCH', {
      version: option.version,
      extraPrice: '5.0000',
    })
  ).modifierOption;
  const accepted = await primary.expect(`/website/orders/${receiptId}/accept`, 'POST', {
    version: 1,
  });
  const order = (await primary.expect(`/orders/${accepted.orderId}`)).order;
  expect(order.total).toBe('12.13');
  expect(order.items[0]).toMatchObject({
    baseUnitPrice: '10.0050',
    unitPrice: '12.1300',
    modifierGroups: detail.items[0].modifierGroups,
  });
  const next = await f.inbound(
    '/orders',
    'POST',
    f.order({
      expectedTotal: '15.01',
      items: [
        {
          externalProductId: f.product.sku,
          quantity: '1',
          modifiers: [
            {
              ...selected,
              groupVersion: requiredBinding.group.version + 1,
              optionIds: [option.id],
            },
            empty,
          ],
        },
      ],
    }),
  );
  expect(next.status).toBe(200);
  expect(next.data.receipt.total).toBe('15.01');
  expect(
    (await primary.expect(`/website/orders/${receiptId}`)).websiteOrder.items[0].modifierGroups,
  ).toEqual(detail.items[0].modifierGroups);
  await primary.expect(`/catalog/modifier-groups/${required.id}/options`, 'POST', {
    name: 'Altă mărime',
    extraPrice: '0.0000',
    sortOrder: 2,
  });
  await primary.expect(`/catalog/modifier-groups/${required.id}/options/${option.id}`, 'PATCH', {
    version: changed.version,
    status: 'ARCHIVED',
  });
  expect(
    (await primary.call(`/website/orders/${next.data.receipt.id}/accept`, 'POST', { version: 1 }))
      .status,
  ).toBe(409);
  expect(
    (await primary.expect(`/website/orders/${next.data.receipt.id}`)).websiteOrder.items[0]
      .modifierGroups[0].options[0].optionName,
  ).toBe('Mare website');
});
