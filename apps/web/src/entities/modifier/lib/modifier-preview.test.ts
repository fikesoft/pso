import { EMPTY_PRODUCT_INFORMATION } from '@pos/contracts/product-information';
import type { CatalogProduct } from '@pos/contracts';
import { expect, it } from 'vitest';
import { previewProductModifiers } from './modifier-preview';

const product: CatalogProduct = {
  ...EMPTY_PRODUCT_INFORMATION,
  scheduleAvailability: null,
  taxRate: null,
  id: 'product',
  categoryId: null,
  name: 'Cafea',
  sku: 'CAFEA',
  description: null,
  status: 'ACTIVE',
  version: 1,
  locationId: 'location',
  price: '10.0050',
  enabled: true,
  locationVersion: 1,
  imageUrl: null,
  modifierGroups: [
    {
      id: 'binding',
      productId: 'product',
      modifierGroupId: 'group',
      sortOrder: 0,
      status: 'ACTIVE',
      version: 3,
      group: {
        id: 'group',
        name: 'Mărime',
        minSelections: 1,
        maxSelections: 1,
        required: true,
        sortOrder: 0,
        status: 'ACTIVE',
        version: 5,
        options: [
          {
            id: 'option',
            modifierGroupId: 'group',
            name: 'Mare',
            extraPrice: '0.1234',
            sortOrder: 0,
            status: 'ACTIVE',
            version: 2,
          },
        ],
      },
    },
  ],
};

it('previews exact per-unit money and captures all versioned group choices', () => {
  expect(previewProductModifiers(product, {}).valid).toBe(false);
  const preview = previewProductModifiers(product, { binding: ['option'] });
  expect(preview.valid).toBe(true);
  expect(preview.unitPrice).toBe('10.1284');
  expect(preview.selections).toEqual([
    { bindingId: 'binding', bindingVersion: 3, groupVersion: 5, optionIds: ['option'] },
  ]);
  expect(preview.snapshots[0]?.options[0]).toMatchObject({ optionName: 'Mare' });
});
