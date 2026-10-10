import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { prepareOrderRepeat } from './api/order-repeat-setup';
import type { OrderRepeatFixture } from './api/order-repeat.types';
import { closeOperations } from './api/operations-setup';
import { verifyRepeatAvailability } from './api/order-repeat-availability.cases';
import {
  verifyRepeatModifiers,
  verifyRepeatRevalidation,
} from './api/order-repeat-modifiers.cases';
import { verifyRepeatAccess, verifyRepeatRevocation } from './api/order-repeat-access.cases';
import {
  verifyLastCustomerOrder,
  verifyLastOrderPagination,
} from './api/order-repeat-latest.cases';

let f: OrderRepeatFixture;
beforeAll(async () => {
  f = await prepareOrderRepeat();
});
afterAll(async () => {
  if (f) await closeOperations(f.owner.id);
});

it('quotes current name, price and tax coherently without copying private history or mutating business rows', async () => {
  const product = await f.makeProduct({ name: 'Nume istoric', price: '10.0050', taxRate: '8' });
  const order = await f.create({
    source: 'PHONE',
    serviceType: 'DELIVERY',
    customerRef: { id: f.customer.id, version: 1 },
    deliveryAddress: { address: 'Adresa istorică privată' },
    notes: 'Notă generală istorică privată',
    items: [
      { productId: product.id, quantity: '1.125', note: 'Notă pe linie' },
      { productId: product.id, quantity: '1.125', note: 'Altă notă pe linie' },
    ],
  });
  await f.confirm(order.id);
  await f.a.primary.expect(`/catalog/products/${product.id}`, 'PATCH', {
    version: product.version,
    name: 'Nume actual',
    taxRate: '20',
  });
  await f.a.primary.expect(`/catalog/products/${product.id}/locations/${f.a.location.id}`, 'PUT', {
    version: product.locationVersion,
    price: '12.3456',
    enabled: true,
  });
  const before = await f.effects(order.id);
  const response = await f.a.primary.call(`/orders/${order.id}/repeat-preview`, 'POST', {
    locationId: f.a.location.id,
  });
  expect(response.status).toBe(200);
  expect(response.headers.get('cache-control')).toContain('no-store');
  const preview = response.data;
  expect(preview).toMatchObject({
    estimatedTotal: '27.78',
    canCreate: true,
    amountAllowed: true,
    currency: 'MDL',
  });
  expect(preview.lines).toHaveLength(2);
  expect(preview.lines.map((line: { sourceItemId: string }) => line.sourceItemId)).toEqual(
    order.items.map((line: { id: string }) => line.id),
  );
  for (const line of preview.lines) {
    expect(line.historical.productName).toBe('Nume istoric');
    expect(line.currentUnitPrice).toBe('12.3456');
    expect(line.currentLineTotal).toBe('13.89');
    expect(line.candidate).toMatchObject({ productId: product.id, quantity: '1.125' });
    expect(
      Object.keys(line.candidate).every((key) =>
        ['modifiers', 'note', 'productId', 'quantity'].includes(key),
      ),
    ).toBe(true);
    expect(line.issues).toContainEqual(
      expect.objectContaining({ code: 'PRICE_CHANGED', blocking: false }),
    );
  }
  expect(preview.products[0]).toMatchObject({
    id: product.id,
    name: 'Nume actual',
    price: '12.3456',
    taxRate: '20.0000',
  });
  const text = JSON.stringify(preview);
  for (const secret of [
    f.customer.phone,
    f.customer.name,
    'Adresa istorică privată',
    'Notă generală istorică privată',
  ])
    expect(text).not.toContain(secret);
  for (const key of [
    'customerRef',
    'addressRef',
    'deliveryAddress',
    'tableLabel',
    'paymentStatus',
    'kitchenStatus',
    'sourceUpsellOfferId',
  ])
    expect(text).not.toContain(`"${key}"`);
  expect(await f.effects(order.id)).toEqual(before);
  const repeated = await f.create({
    items: preview.lines.map((line: { candidate: unknown }) => line.candidate),
  });
  expect(repeated.items).toHaveLength(2);
  for (const item of repeated.items) {
    expect(item.taxRateSnapshot).toBe('20.0000');
    expect(item.unitPrice).toBe('12.3456');
    expect(order.items.map((line: { id: string }) => line.id)).not.toContain(item.id);
  }
  expect((await f.current(order.id)).items[0].taxRateSnapshot).toBe('8.0000');
});

it('removes historical upsell provenance and lifecycle state from a newly created repeat', async () => {
  const rule = (
    await f.a.primary.expect('/catalog/upsell-rules', 'POST', {
      requestKey: randomUUID(),
      locationId: f.a.location.id,
      sourceProductId: f.product.id,
      targetProductId: f.secondProduct.id,
      name: 'Repetare ofertă',
    })
  ).rule;
  const offer = (
    await f.a.primary.expect('/catalog/upsell-offers', 'POST', {
      requestKey: randomUUID(),
      locationId: f.a.location.id,
      ruleId: rule.id,
      ruleVersion: rule.version,
      productIds: [f.product.id],
    })
  ).offer;
  await f.a.primary.expect(`/catalog/upsell-offers/${offer.id}/accept`, 'POST', {});
  const source = await f.complete({
    items: [
      { productId: f.product.id, quantity: '1' },
      { productId: f.secondProduct.id, quantity: '2', sourceUpsellOfferId: offer.id },
    ],
  });
  await f.a.primary.expect(`/orders/${source.id}/payments`, 'POST', {
    version: source.version,
    requestKey: randomUUID(),
    cashShiftId: (await f.cashShift()).id,
    confirmed: true,
    payments: [{ method: 'CASH', amount: '1', receivedAmount: '1' }],
  });
  const before = await f.effects(source.id);
  const preview = await f.preview(source.id);
  expect(JSON.stringify(preview)).not.toContain(offer.id);
  expect(await f.effects(source.id)).toEqual(before);
  const repeated = await f.create({
    items: preview.lines.map((line: { candidate: unknown }) => line.candidate),
  });
  expect(repeated).toMatchObject({
    status: 'DRAFT',
    kitchenStatus: 'NOT_SENT',
    paymentStatus: 'UNPAID',
    checkout: null,
    customerRef: null,
    addressRef: null,
  });
  expect(repeated.id).not.toBe(source.id);
  expect(
    repeated.items.every(
      (line: { sourceUpsellOfferId: string | null }) => !line.sourceUpsellOfferId,
    ),
  ).toBe(true);
  expect((await f.effects(source.id)).order).toEqual(before.order);
  expect((await f.effects(source.id)).items).toEqual(before.items);
});

it('keeps unavailable products explicit with blocking issues for archive, location, disabled and schedule changes', async () => {
  await verifyRepeatAvailability(f);
});
it('uses current modifier identities and versions without silently dropping, choosing or remapping options', async () => {
  await verifyRepeatModifiers(f);
});
it('revalidates the final order against changes after preview instead of accepting the quote as a reservation', async () => {
  await verifyRepeatRevalidation(f);
});
it('authorizes both historical source and current target, reports creation amount restrictions and rejects drafts', async () => {
  await verifyRepeatAccess(f);
});
it('finds only explicitly linked completed orders in the current location and applies amount authorization per row', async () => {
  await verifyLastCustomerOrder(f);
});
it('terminates a found last-order match and refuses malformed or cross-domain cursors', async () => {
  await verifyLastOrderPagination(f);
});
it('rechecks current DENY for preview and CRM history independently of organization profile access', async () => {
  await verifyRepeatRevocation(f);
});
