import { expect, it } from 'vitest';
import { catalogQuerySchema, createCategorySchema, updateCategorySchema } from './catalog.schema';

it('interpretează explicit parametrul includeArchived', () => {
  const locationId = '11111111-1111-4111-8111-111111111111';
  expect(catalogQuerySchema.parse({ locationId }).includeArchived).toBeUndefined();
  expect(catalogQuerySchema.parse({ locationId, includeArchived: 'false' }).includeArchived).toBe(
    false,
  );
  expect(catalogQuerySchema.parse({ locationId, includeArchived: 'true' }).includeArchived).toBe(
    true,
  );
  expect(catalogQuerySchema.safeParse({ locationId, includeArchived: 'yes' }).success).toBe(false);
});

it('limitează ordinea categoriei și cere o modificare reală la PATCH', () => {
  expect(createCategorySchema.parse({ name: 'Băuturi' }).sortOrder).toBeUndefined();
  for (const sortOrder of [0, 100_000])
    expect(createCategorySchema.safeParse({ name: 'Băuturi', sortOrder }).success).toBe(true);
  for (const sortOrder of [-1, 100_001, 1.5, '1'])
    expect(createCategorySchema.safeParse({ name: 'Băuturi', sortOrder }).success).toBe(false);
  expect(updateCategorySchema.safeParse({ version: 1 }).success).toBe(false);
  expect(updateCategorySchema.safeParse({ version: 1, status: 'ARCHIVED' }).success).toBe(true);
});
