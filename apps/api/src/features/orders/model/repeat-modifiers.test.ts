import { randomUUID } from 'node:crypto';
import { expect, it } from 'vitest';
import type { ModifierGroupSnapshotDto, ProductModifierGroupDto } from '@pos/contracts';
import { repeatModifierSelections } from './repeat-modifiers';
const optionId = randomUUID(),
  groupId = randomUUID(),
  bindingId = randomUUID();
const old: ModifierGroupSnapshotDto = {
  bindingId,
  groupId,
  groupName: 'Sos',
  minSelections: 1,
  maxSelections: 2,
  groupVersion: 1,
  bindingVersion: 1,
  position: 0,
  options: [
    { optionId, optionName: 'Sos sintetic', extraPrice: '1.0000', optionVersion: 1, position: 0 },
  ],
};
const current: ProductModifierGroupDto = {
  id: bindingId,
  productId: randomUUID(),
  modifierGroupId: groupId,
  sortOrder: 0,
  status: 'ACTIVE',
  version: 2,
  group: {
    id: groupId,
    name: 'Sos nou',
    minSelections: 1,
    maxSelections: 2,
    required: true,
    sortOrder: 0,
    status: 'ACTIVE',
    version: 3,
    options: [
      {
        id: optionId,
        modifierGroupId: groupId,
        name: 'Sos nou',
        extraPrice: '2.0000',
        sortOrder: 0,
        status: 'ACTIVE',
        version: 2,
      },
    ],
  },
};
it('păstrează IDurile reale și reîmprospătează versiunile fără metadate vechi de atribuire', () => {
  const result = repeatModifierSelections([old], [current]);
  expect(result.selections).toEqual([
    { bindingId, bindingVersion: 2, groupVersion: 3, optionIds: [optionId] },
  ]);
  expect(result.issues.length).toBeGreaterThan(0);
  expect(result.issues.every((issue) => !issue.blocking)).toBe(true);
});
it('nu remapează după nume/grup și nu elimină opțiuni dispărute fără decizie', () => {
  const rebound = repeatModifierSelections([old], [{ ...current, id: randomUUID() }]);
  expect(rebound.issues).toContainEqual({
    code: 'MODIFIER_UNAVAILABLE',
    blocking: true,
    bindingId,
  });
  expect(rebound.issues.some((issue) => issue.code === 'MODIFIER_SELECTION_REQUIRED')).toBe(true);
  const missing = repeatModifierSelections(
    [old],
    [{ ...current, group: { ...current.group, options: [] } }],
  );
  expect(missing.selections[0]!.optionIds).toEqual([optionId]);
  expect(missing.issues).toContainEqual({
    code: 'MODIFIER_UNAVAILABLE',
    blocking: true,
    bindingId,
    optionId,
  });
});
it('noile limite necesită reparare; eliminarea unui grup neales rămâne doar informativă', () => {
  const empty = { ...old, options: [] };
  expect(repeatModifierSelections([empty], []).issues).toEqual([
    { code: 'CONFIGURATION_CHANGED', blocking: false, bindingId },
  ]);
  expect(
    repeatModifierSelections([], [current]).issues.some(
      (issue) => issue.code === 'MODIFIER_SELECTION_REQUIRED' && issue.blocking,
    ),
  ).toBe(true);
  expect(
    repeatModifierSelections(
      [old],
      [{ ...current, group: { ...current.group, maxSelections: 0 } }],
    ).issues.some((issue) => issue.code === 'MODIFIER_SELECTION_INVALID' && issue.blocking),
  ).toBe(true);
});
