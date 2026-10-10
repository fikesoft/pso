import { expect, it } from 'vitest';
import { createBrandSchema, updateBrandSchema } from './brands.schema';

it('codul brandului are un namespace normalizat, fără selectarea tenantului din payload', () => {
  expect(createBrandSchema.parse({ name: ' Coffee ', code: 'coffee' })).toEqual({
    name: 'Coffee',
    code: 'COFFEE',
  });
  expect(
    createBrandSchema.safeParse({
      name: 'Coffee',
      code: 'coffee',
      organizationId: crypto.randomUUID(),
    }).success,
  ).toBe(false);
});

it('modificarea brandului cere versiune și nu rescrie codul istoric', () => {
  expect(updateBrandSchema.safeParse({ name: 'Nou' }).success).toBe(false);
  expect(updateBrandSchema.safeParse({ code: 'NOU', version: 1 }).success).toBe(false);
  expect(updateBrandSchema.parse({ name: 'Nou', status: 'DISABLED', version: 2 })).toEqual({
    name: 'Nou',
    status: 'DISABLED',
    version: 2,
  });
});
