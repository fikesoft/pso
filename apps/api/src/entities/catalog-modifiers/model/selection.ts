import type {
  ModifierGroupSnapshotDto,
  ModifierSelectionInput,
  ProductModifierGroupDto,
} from '@pos/contracts';
import {
  MAX_LINE_SELECTED_MODIFIERS,
  MODIFIER_CONFIGURATION_STALE,
} from '@pos/contracts/modifiers';
import { assert, HttpError } from '../../../shared/lib/http';
import { decimalString, decimalUnits } from '../../../shared/lib/money';

export function canonicalizeModifierSelections(
  selections: readonly ModifierSelectionInput[] | undefined,
): ModifierSelectionInput[] {
  return (selections ?? [])
    .map((selection) => ({
      bindingId: selection.bindingId,
      bindingVersion: selection.bindingVersion,
      groupVersion: selection.groupVersion,
      optionIds: [...selection.optionIds].sort(),
    }))
    .sort((a, b) => a.bindingId.localeCompare(b.bindingId));
}

export function resolveProductModifiers(
  config: readonly ProductModifierGroupDto[],
  selections: readonly ModifierSelectionInput[] = [],
): { unitExtraPrice: string; snapshots: ModifierGroupSnapshotDto[] } {
  const selected = new Map(selections.map((selection) => [selection.bindingId, selection]));
  assert(selected.size === selections.length, 400, 'Grupuri de modificatori duplicate');
  if (
    !selections.every((selection) => config.some((binding) => binding.id === selection.bindingId))
  )
    throw new HttpError(
      409,
      'Configurația modificatorilor s-a schimbat. Reîncărcați catalogul.',
      MODIFIER_CONFIGURATION_STALE,
    );
  let extraUnits = 0n;
  let totalSelected = 0;
  const snapshots = config.map((binding, position) => {
    const choice = selected.get(binding.id);
    if (choice) {
      if (
        choice.bindingVersion !== binding.version ||
        choice.groupVersion !== binding.group.version
      )
        throw new HttpError(
          409,
          'Configurația modificatorilor s-a schimbat. Reîncărcați catalogul.',
          MODIFIER_CONFIGURATION_STALE,
        );
    }
    const optionIds = choice?.optionIds ?? [];
    assert(new Set(optionIds).size === optionIds.length, 400, 'Opțiuni duplicate');
    assert(
      optionIds.length >= binding.group.minSelections &&
        optionIds.length <= binding.group.maxSelections,
      400,
      'Numărul de opțiuni selectate nu respectă grupul.',
    );
    totalSelected += optionIds.length;
    const options = optionIds.map((id) => {
      const option = binding.group.options.find((candidate) => candidate.id === id);
      if (!option)
        throw new HttpError(
          409,
          'Opțiunea nu mai este disponibilă. Reîncărcați catalogul.',
          MODIFIER_CONFIGURATION_STALE,
        );
      return option;
    });
    options.sort(
      (a, b) =>
        a.sortOrder - b.sortOrder || a.name.localeCompare(b.name) || a.id.localeCompare(b.id),
    );
    return {
      bindingId: binding.id,
      groupId: binding.group.id,
      groupName: binding.group.name,
      minSelections: binding.group.minSelections,
      maxSelections: binding.group.maxSelections,
      groupVersion: binding.group.version,
      bindingVersion: binding.version,
      position,
      options: options.map((option, optionPosition) => {
        extraUnits += decimalUnits(option.extraPrice, 4);
        return {
          optionId: option.id,
          optionName: option.name,
          extraPrice: option.extraPrice,
          optionVersion: option.version,
          position: optionPosition,
        };
      }),
    };
  });
  assert(totalSelected <= MAX_LINE_SELECTED_MODIFIERS, 400, 'Prea multe opțiuni selectate.');
  return { unitExtraPrice: decimalString(extraUnits, 4), snapshots };
}
