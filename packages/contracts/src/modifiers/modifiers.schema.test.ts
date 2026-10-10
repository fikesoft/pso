import { expect, it } from 'vitest';
import { modifierSelectionsSchema } from '../shared';
import {
  createModifierGroupSchema,
  modifierGroupQuerySchema,
  updateModifierGroupSchema,
} from './modifiers.schema';

const id = '11111111-1111-4111-8111-111111111111';

it('bounds group selection policy and paginated archive query', () => {
  expect(
    createModifierGroupSchema.safeParse({ name: 'Sos', minSelections: 0, maxSelections: 10 })
      .success,
  ).toBe(true);
  expect(
    createModifierGroupSchema.safeParse({ name: 'Sos', minSelections: 2, maxSelections: 1 })
      .success,
  ).toBe(false);
  expect(
    createModifierGroupSchema.safeParse({ name: 'Sos', minSelections: 0, maxSelections: 11 })
      .success,
  ).toBe(false);
  expect(updateModifierGroupSchema.safeParse({ version: 1 }).success).toBe(false);
  expect(modifierGroupQuerySchema.parse({ locationId: id, includeArchived: 'true' }).limit).toBe(
    50,
  );
});

it('requires distinct binding and option IDs in submitted selections', () => {
  const choice = { bindingId: id, bindingVersion: 1, groupVersion: 1, optionIds: [id] };
  expect(modifierSelectionsSchema.safeParse([choice]).success).toBe(true);
  expect(modifierSelectionsSchema.safeParse([choice, choice]).success).toBe(false);
  expect(modifierSelectionsSchema.safeParse([{ ...choice, optionIds: [id, id] }]).success).toBe(
    false,
  );
});
