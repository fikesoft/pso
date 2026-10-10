import type { ModifierGroupSnapshotDto, ProductModifierGroupDto } from '@pos/contracts';
import { MAX_LINE_SELECTED_MODIFIERS } from '@pos/contracts/modifiers';
import type { RepeatModifierResolution } from './repeat-modifiers.types';

export function repeatModifierSelections(
  previous: readonly ModifierGroupSnapshotDto[],
  current: readonly ProductModifierGroupDto[],
): RepeatModifierResolution {
  const result: RepeatModifierResolution = { selections: [], issues: [] };
  for (const old of previous) {
    const binding = current.find(
      (entry) => entry.id === old.bindingId && entry.group.id === old.groupId,
    );
    if (!binding) {
      result.issues.push({
        code: old.options.length ? 'MODIFIER_UNAVAILABLE' : 'CONFIGURATION_CHANGED',
        blocking: old.options.length > 0,
        bindingId: old.bindingId,
      });
      continue;
    }
    if (
      binding.version !== old.bindingVersion ||
      binding.group.version !== old.groupVersion ||
      binding.group.name !== old.groupName
    )
      result.issues.push({ code: 'CONFIGURATION_CHANGED', blocking: false, bindingId: binding.id });
    for (const option of old.options) {
      const active = binding.group.options.find((entry) => entry.id === option.optionId);
      if (!active)
        result.issues.push({
          code: 'MODIFIER_UNAVAILABLE',
          blocking: true,
          bindingId: binding.id,
          optionId: option.optionId,
        });
      else if (
        active.version !== option.optionVersion ||
        active.name !== option.optionName ||
        active.extraPrice !== option.extraPrice
      )
        result.issues.push({
          code: 'CONFIGURATION_CHANGED',
          blocking: false,
          bindingId: binding.id,
          optionId: option.optionId,
        });
    }
  }
  for (const binding of current) {
    const old = previous.find(
      (entry) => entry.bindingId === binding.id && entry.groupId === binding.group.id,
    );
    const ids = old?.options.map((entry) => entry.optionId) ?? [];
    if (!old)
      result.issues.push({ code: 'CONFIGURATION_CHANGED', blocking: false, bindingId: binding.id });
    if (ids.length < binding.group.minSelections || ids.length > binding.group.maxSelections)
      result.issues.push({
        code:
          ids.length === 0 && binding.group.minSelections > 0
            ? 'MODIFIER_SELECTION_REQUIRED'
            : 'MODIFIER_SELECTION_INVALID',
        blocking: true,
        bindingId: binding.id,
      });
    result.selections.push({
      bindingId: binding.id,
      bindingVersion: binding.version,
      groupVersion: binding.group.version,
      optionIds: ids,
    });
  }
  if (
    result.selections.reduce((count, selection) => count + selection.optionIds.length, 0) >
    MAX_LINE_SELECTED_MODIFIERS
  )
    result.issues.push({ code: 'MODIFIER_SELECTION_INVALID', blocking: true });
  return result;
}
