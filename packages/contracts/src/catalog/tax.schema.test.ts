import { expect, it } from 'vitest';
import { createProductSchema, updateProductSchema } from './catalog.schema';
import { productTaxRateSchema } from './tax.schema';

it('keeps unset and explicit zero distinct while accepting exact four-decimal rates', () => {
  for (const value of ['0', '0.0000', '7.1250', '100.0000'])
    expect(productTaxRateSchema.parse(value)).toBe(value);
  const product = {
    locationId: '11111111-1111-4111-8111-111111111111',
    name: 'Produs',
    sku: 'P',
    price: '10.00',
  };
  expect(createProductSchema.parse(product).taxRate).toBeUndefined();
  expect(createProductSchema.parse({ ...product, taxRate: null }).taxRate).toBeNull();
  expect(updateProductSchema.parse({ version: 1, taxRate: null }).taxRate).toBeNull();
});

it('rejects malformed, negative, excessive or silently rounded tax rates', () => {
  for (const value of [
    '',
    ' 7',
    '7 ',
    '7,1250',
    'NaN',
    'Infinity',
    '1e1',
    '-0',
    '-1',
    '001',
    '.5',
    '1.',
    '100.0001',
    '7.12345',
    7,
  ])
    expect(productTaxRateSchema.safeParse(value).success).toBe(false);
});
