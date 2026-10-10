import type { ProductModifierGroupDto } from '@pos/contracts';
import { expect, it } from 'vitest';
import { canonicalizeModifierSelections, resolveProductModifiers } from './selection';

const first = '11111111-1111-4111-8111-111111111111';
const second = '22222222-2222-4222-8222-222222222222';
const third = '33333333-3333-4333-8333-333333333333';

const config: ProductModifierGroupDto[] = [
  {
    id: first,
    productId: third,
    modifierGroupId: second,
    sortOrder: 0,
    status: 'ACTIVE',
    version: 4,
    group: {
      id: second,
      name: 'Mărime',
      minSelections: 1,
      maxSelections: 1,
      required: true,
      sortOrder: 0,
      status: 'ACTIVE',
      version: 5,
      options: [
        {
          id: third,
          modifierGroupId: second,
          name: 'Mare',
          extraPrice: '0.1234',
          sortOrder: 0,
          status: 'ACTIVE',
          version: 2,
        },
      ],
    },
  },
];

it('prices exact extras and snapshots the current versioned choice', () => {
  const result = resolveProductModifiers(config, [
    { bindingId: first, bindingVersion: 4, groupVersion: 5, optionIds: [third] },
  ]);
  expect(result.unitExtraPrice).toBe('0.1234');
  expect(result.snapshots[0]).toMatchObject({
    bindingId: first,
    groupName: 'Mărime',
    groupVersion: 5,
    options: [{ optionName: 'Mare', extraPrice: '0.1234', optionVersion: 2 }],
  });
});

it('rejects missing required choice, stale group version, and inactive option', () => {
  expect(() => resolveProductModifiers(config, [])).toThrow();
  expect(() =>
    resolveProductModifiers(config, [
      { bindingId: first, bindingVersion: 4, groupVersion: 4, optionIds: [third] },
    ]),
  ).toThrow();
  expect(() =>
    resolveProductModifiers(config, [
      { bindingId: first, bindingVersion: 4, groupVersion: 5, optionIds: [first] },
    ]),
  ).toThrow();
});

it('canonicalizes modifier ordering for request replay without prices', () => {
  const ordered = canonicalizeModifierSelections([
    { bindingId: second, bindingVersion: 2, groupVersion: 3, optionIds: [third, first] },
    { bindingId: first, bindingVersion: 1, groupVersion: 2, optionIds: [] },
  ]);
  expect(ordered.map((item) => item.bindingId)).toEqual([first, second]);
  expect(ordered[1]?.optionIds).toEqual([first, third]);
  expect(canonicalizeModifierSelections(undefined)).toEqual([]);
});
