import type { ModifierGroupDto, ModifierOptionDto, ProductModifierGroupDto } from '@pos/contracts';
import type {
  StoredModifierGroup,
  StoredModifierOption,
  StoredProductModifierGroup,
} from './modifier.types';

export function modifierOptionDto(option: StoredModifierOption): ModifierOptionDto {
  return {
    id: option.id,
    modifierGroupId: option.modifierGroupId,
    name: option.name,
    extraPrice: option.extraPrice.toFixed(4),
    sortOrder: option.sortOrder,
    status: option.status as ModifierOptionDto['status'],
    version: option.version,
  };
}

export function modifierGroupDto(
  group: StoredModifierGroup,
  options: readonly StoredModifierOption[] = [],
): ModifierGroupDto {
  return {
    id: group.id,
    name: group.name,
    minSelections: group.minSelections,
    maxSelections: group.maxSelections,
    required: group.minSelections > 0,
    sortOrder: group.sortOrder,
    status: group.status as ModifierGroupDto['status'],
    version: group.version,
    options: options
      .filter((option) => option.modifierGroupId === group.id && option.status === 'ACTIVE')
      .sort(
        (a, b) =>
          a.sortOrder - b.sortOrder || a.name.localeCompare(b.name) || a.id.localeCompare(b.id),
      )
      .map(modifierOptionDto),
  };
}

export function productModifierGroupDto(
  binding: StoredProductModifierGroup,
  group: StoredModifierGroup,
  options: readonly StoredModifierOption[] = [],
): ProductModifierGroupDto {
  return {
    id: binding.id,
    productId: binding.productId,
    modifierGroupId: binding.modifierGroupId,
    sortOrder: binding.sortOrder,
    status: binding.status as ProductModifierGroupDto['status'],
    version: binding.version,
    group: modifierGroupDto(group, options),
  };
}
