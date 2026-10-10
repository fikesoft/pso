import { expect, it } from 'vitest';
import type {
  CatalogProduct,
  OrderRepeatPreviewLine,
  OrderRepeatPreviewResponse,
} from '@pos/contracts';
import {
  canRepairRepeatRow,
  prepareRepeatRows,
  repairRepeatRow,
  transferableRepeatLines,
} from './order-repeat';
const product = {
  id: 'product',
  name: 'Produs curent',
  price: '12.3456',
  status: 'ACTIVE',
  enabled: true,
  locationVersion: 2,
  scheduleAvailability: null,
  modifierGroups: [],
} as unknown as CatalogProduct;
function line(sourceItemId: string): OrderRepeatPreviewLine {
  return {
    sourceItemId,
    productId: 'product',
    historical: {
      productName: 'Vechi',
      productSku: 'SKU',
      unitPrice: '9.0000',
      quantity: '2.500',
      note: 'Notă păstrată',
      modifierGroups: [],
    },
    candidate: { productId: 'product', quantity: '2.500', note: 'Notă păstrată', modifiers: [] },
    currentUnitPrice: '12.3456',
    currentLineTotal: '30.86',
    issues: [{ code: 'PRICE_CHANGED', blocking: false }],
  };
}
function response(lines: OrderRepeatPreviewLine[]) {
  return { products: [product], lines } as OrderRepeatPreviewResponse;
}
it('păstrează etapa mesei când construiește o ciornă repetată', () => {
  const source = line('desert');
  source.historical.courseNumber = 3;
  source.candidate!.courseNumber = 3;
  expect(transferableRepeatLines(prepareRepeatRows(response([source])))![0]!.courseNumber).toBe(3);
});
it('creates distinct fresh lines using current price without historical item or upsell identity', () => {
  const rows = prepareRepeatRows(response([line('old-a'), line('old-b')]));
  const items = transferableRepeatLines(rows)!;
  expect(items).toHaveLength(2);
  expect(items[0]).toMatchObject({
    name: 'Produs curent',
    price: '12.3456',
    quantity: '2.500',
    note: 'Notă păstrată',
  });
  expect(items[0].clientId).not.toBe(items[1].clientId);
  for (const item of items) {
    expect(item).not.toHaveProperty('id');
    expect(item).not.toHaveProperty('sourceUpsellOfferId');
  }
});
it('never silently transfers only the valid subset; removal is explicit and cannot remove every line', () => {
  const blocked = {
    ...line('blocked'),
    candidate: null,
    issues: [{ code: 'PRODUCT_UNAVAILABLE' as const, blocking: true }],
  };
  const rows = prepareRepeatRows(response([line('valid'), blocked]));
  expect(transferableRepeatLines(rows)).toBeNull();
  expect(transferableRepeatLines([rows[0], { ...rows[1], removed: true }])).toHaveLength(1);
  expect(transferableRepeatLines(rows.map((row) => ({ ...row, removed: true })))).toBeNull();
  expect(canRepairRepeatRow(rows[1])).toBe(false);
  expect(repairRepeatRow(rows[1], {})).toBe(rows[1]);
});
it('requires explicit repair after old modifier removal even when current configuration has no groups', () => {
  const blocked = {
    ...line('changed'),
    candidate: null,
    issues: [{ code: 'MODIFIER_UNAVAILABLE' as const, blocking: true }],
  };
  const row = prepareRepeatRows(response([blocked]))[0];
  expect(row.draft).toBeNull();
  const repaired = repairRepeatRow(row, {});
  expect(repaired.draft).toMatchObject({ quantity: '2.500', note: 'Notă păstrată', modifiers: [] });
  expect(transferableRepeatLines([repaired])).toHaveLength(1);
});
it('does not repair unavailable target products by accepting empty options', () => {
  const row = prepareRepeatRows(response([{ ...line('bad'), candidate: null }]))[0];
  for (const unavailable of [
    { ...product, enabled: false },
    { ...product, price: null },
    { ...product, locationVersion: null },
  ])
    expect(repairRepeatRow({ ...row, product: unavailable }, {}).draft).toBeNull();
});
