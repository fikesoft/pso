import { expect, it } from 'vitest';
import { createProductSchema, updateProductSchema } from './catalog.schema';
import { productInformationSchema } from './product-information.schema';

it('keeps unknown values distinct from explicit zeros and empty declared lists', () => {
  expect(productInformationSchema.parse({})).toEqual({});
  expect(productInformationSchema.parse({ calories: null, allergens: null })).toEqual({
    calories: null,
    allergens: null,
  });
  expect(productInformationSchema.parse({ calories: '0.000', allergens: [] })).toEqual({
    calories: '0.000',
    allergens: [],
  });
  expect(
    productInformationSchema.parse({
      allergens: [' MILK ', 'GLUTEN'],
      ingredients: ['Lapte', 'Cafea'],
    }),
  ).toEqual({ allergens: ['MILK', 'GLUTEN'], ingredients: ['Lapte', 'Cafea'] });
});
it('bounds numeric precision and rejects ambiguous or malformed declarations', () => {
  for (const calories of ['-1', 'NaN', 'Infinity', '1e3', '1.0001', '1000000', 5, ''])
    expect(productInformationSchema.safeParse({ calories }).success).toBe(false);
  expect(
    productInformationSchema.parse({ calories: '999999.999', nutritionBasis: 'PER_100G' }).calories,
  ).toBe('999999.999');
  for (const allergens of [
    ['MILK', 'milk'],
    [''],
    [null],
    ['x'.repeat(101)],
    Array.from({ length: 31 }, (_, index) => `allergen-${index}`),
  ])
    expect(productInformationSchema.safeParse({ allergens }).success).toBe(false);
  expect(productInformationSchema.safeParse({ nutritionBasis: 'UNSPECIFIED' }).success).toBe(false);
  expect(productInformationSchema.safeParse({ allergensDeclared: true }).success).toBe(false);
});
it('supports catalog creation and partial versioned updates without clearing omitted fields', () => {
  expect(updateProductSchema.parse({ version: 2, protein: '10.005' })).toEqual({
    version: 2,
    protein: '10.005',
  });
  const created = createProductSchema.parse({
    locationId: '10000000-0000-4000-8000-000000000001',
    name: 'Cafea',
    sku: 'COFFEE',
    price: '15',
    calories: '30',
    protein: null,
    fat: '2.5',
    carbs: '0',
    allergens: ['MILK'],
    ingredients: ['Cafea', 'Lapte'],
    nutritionBasis: 'PER_PORTION',
  });
  expect(created.allergens).toEqual(['MILK']);
});
