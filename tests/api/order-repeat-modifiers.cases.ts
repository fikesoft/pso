import { expect } from 'vitest';
import type { OrderRepeatFixture } from './order-repeat.types';

async function configured(f: OrderRepeatFixture) {
  const product = await f.makeProduct();
  const group = (
    await f.a.primary.expect('/catalog/modifier-groups', 'POST', {
      name: 'Adaos repetare',
      minSelections: 1,
      maxSelections: 2,
    })
  ).modifierGroup;
  const option = (
    await f.a.primary.expect(`/catalog/modifier-groups/${group.id}/options`, 'POST', {
      name: 'Adaos',
      extraPrice: '1.0050',
    })
  ).modifierOption;
  await f.a.primary.expect(`/catalog/products/${product.id}/modifier-groups`, 'POST', {
    modifierGroupId: group.id,
  });
  const current = (
    await f.a.primary.expect(`/catalog/products/${product.id}?locationId=${f.a.location.id}`)
  ).product;
  const binding = current.modifierGroups[0];
  const selection = {
    bindingId: binding.id,
    bindingVersion: binding.version,
    groupVersion: binding.group.version,
    optionIds: [option.id],
  };
  const order = await f.create({
    items: [{ productId: product.id, quantity: '2', modifiers: [selection] }],
  });
  await f.confirm(order.id);
  return { product, group, option, binding, selection, order };
}

export async function verifyRepeatModifiers(f: OrderRepeatFixture) {
  const a = await configured(f);
  await f.a.primary.expect(
    `/catalog/modifier-groups/${a.group.id}/options/${a.option.id}`,
    'PATCH',
    { version: a.option.version, extraPrice: '2.1250' },
  );
  const preview = await f.preview(a.order.id);
  expect(preview).toMatchObject({ canCreate: true, estimatedTotal: '24.25' });
  const fresh = preview.products[0].modifierGroups[0];
  expect(preview.lines[0].candidate.modifiers).toEqual([
    {
      bindingId: fresh.id,
      bindingVersion: fresh.version,
      groupVersion: fresh.group.version,
      optionIds: [a.option.id],
    },
  ]);
  expect(preview.lines[0].issues).toContainEqual(
    expect.objectContaining({ code: 'PRICE_CHANGED', blocking: false }),
  );
  await f.a.primary.expect(`/catalog/modifier-groups/${a.group.id}/options`, 'POST', {
    name: 'Înlocuitor neales automat',
    extraPrice: '0',
  });
  const newOption = (
    await f.a.primary.expect(
      `/catalog/modifier-groups/${a.group.id}/options/${a.option.id}?locationId=${f.a.location.id}`,
    )
  ).modifierOption;
  await f.a.primary.expect(
    `/catalog/modifier-groups/${a.group.id}/options/${a.option.id}`,
    'PATCH',
    { version: newOption.version, status: 'ARCHIVED' },
  );
  const archived = await f.preview(a.order.id);
  expect(archived.lines[0].candidate).toBeNull();
  expect(archived.lines[0].issues).toContainEqual(
    expect.objectContaining({ code: 'MODIFIER_UNAVAILABLE', blocking: true }),
  );
  const b = await configured(f);
  await f.a.primary.expect(
    `/catalog/products/${b.product.id}/modifier-groups/${b.binding.id}`,
    'PATCH',
    { version: b.binding.version, status: 'ARCHIVED' },
  );
  const renamedGroup = (
    await f.a.primary.expect('/catalog/modifier-groups', 'POST', {
      name: 'Adaos repetare',
      minSelections: 1,
      maxSelections: 2,
    })
  ).modifierGroup;
  await f.a.primary.expect(`/catalog/modifier-groups/${renamedGroup.id}/options`, 'POST', {
    name: 'Adaos',
    extraPrice: '1.0050',
  });
  const remapped = await f.a.primary.expect(
    `/catalog/products/${b.product.id}/modifier-groups`,
    'POST',
    { modifierGroupId: renamedGroup.id },
  );
  expect(remapped.modifierGroup.id).not.toBe(b.binding.id);
  expect((await f.preview(b.order.id)).lines[0].candidate).toBeNull();
  const c = await configured(f);
  const required = (
    await f.a.primary.expect('/catalog/modifier-groups', 'POST', {
      name: 'Obligatoriu nou',
      minSelections: 1,
      maxSelections: 1,
    })
  ).modifierGroup;
  await f.a.primary.expect(`/catalog/modifier-groups/${required.id}/options`, 'POST', {
    name: 'Nu alege automat',
    extraPrice: '0',
  });
  await f.a.primary.expect(`/catalog/products/${c.product.id}/modifier-groups`, 'POST', {
    modifierGroupId: required.id,
  });
  const missing = await f.preview(c.order.id);
  expect(missing.lines[0].candidate).toBeNull();
  expect(missing.lines[0].issues).toContainEqual(
    expect.objectContaining({ code: 'MODIFIER_SELECTION_REQUIRED', blocking: true }),
  );
}

export async function verifyRepeatRevalidation(f: OrderRepeatFixture) {
  const f1 = await configured(f);
  const quote = await f.preview(f1.order.id);
  await f.a.primary.expect(
    `/catalog/modifier-groups/${f1.group.id}/options/${f1.option.id}`,
    'PATCH',
    { version: f1.option.version, extraPrice: '7' },
  );
  const stale = await f.a.primary.call(
    '/orders',
    'POST',
    f.draft({
      serviceType: 'PICKUP',
      items: quote.lines.map((line: { candidate: unknown }) => line.candidate),
    }),
  );
  expect(stale.status).toBe(409);
  expect(stale.data.code).toBe('MODIFIER_CONFIGURATION_STALE');
  const refreshed = await f.preview(f1.order.id);
  const created = await f.create({
    items: refreshed.lines.map((line: { candidate: unknown }) => line.candidate),
  });
  expect(created.total).toBe('34.00');
  const plain = await f.makeProduct({ price: '3' });
  const original = await f.create({ items: [{ productId: plain.id, quantity: '2' }] });
  await f.confirm(original.id);
  const originalQuote = await f.preview(original.id);
  await f.a.primary.expect(`/catalog/products/${plain.id}/locations/${f.a.location.id}`, 'PUT', {
    version: plain.locationVersion,
    price: '8',
    enabled: true,
  });
  const changed = await f.create({
    items: originalQuote.lines.map((line: { candidate: unknown }) => line.candidate),
  });
  expect(changed.total).toBe('16.00');
  expect(originalQuote.estimatedTotal).toBe('6.00');
}
