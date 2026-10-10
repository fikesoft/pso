import type { CatalogProduct } from '@pos/contracts';
import type { ModifierChoices, ModifierPreview } from '../model/modifier.types';

function units(value: string) {
  const [whole = '0', fractional = ''] = value.split('.');
  return BigInt(whole) * 10_000n + BigInt(fractional.padEnd(4, '0'));
}

function amount(value: bigint) {
  const digits = value.toString().padStart(5, '0');
  return `${digits.slice(0, -4)}.${digits.slice(-4)}`;
}

export function previewProductModifiers(
  product: CatalogProduct,
  choices: ModifierChoices,
): ModifierPreview {
  let total = units(product.price ?? '0');
  let valid = true;
  let totalSelected = 0;
  const selections: ModifierPreview['selections'] = [];
  const snapshots: ModifierPreview['snapshots'] = [];
  product.modifierGroups.forEach((binding, position) => {
    const optionIds = choices[binding.id] ?? [];
    totalSelected += optionIds.length;
    if (
      optionIds.length < binding.group.minSelections ||
      optionIds.length > binding.group.maxSelections
    )
      valid = false;
    selections.push({
      bindingId: binding.id,
      bindingVersion: binding.version,
      groupVersion: binding.group.version,
      optionIds,
    });
    const selected = binding.group.options.filter((option) => optionIds.includes(option.id));
    if (selected.length !== optionIds.length) valid = false;
    snapshots.push({
      bindingId: binding.id,
      groupId: binding.group.id,
      groupName: binding.group.name,
      minSelections: binding.group.minSelections,
      maxSelections: binding.group.maxSelections,
      groupVersion: binding.group.version,
      bindingVersion: binding.version,
      position,
      options: selected.map((option, optionPosition) => {
        total += units(option.extraPrice);
        return {
          optionId: option.id,
          optionName: option.name,
          extraPrice: option.extraPrice,
          optionVersion: option.version,
          position: optionPosition,
        };
      }),
    });
  });
  if (totalSelected > 20) valid = false;
  return { valid, unitPrice: amount(total), selections, snapshots };
}
