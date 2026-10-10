import { WEBSITE_PRODUCT_UNAVAILABLE } from '@pos/contracts';
import type { ModifierGroupSnapshotDto } from '@pos/contracts';
import type { TenantTransaction } from '@pos/db';
import { loadProductModifierConfigs } from '../../../entities/catalog-modifiers';
import { loadWebsiteOrderItemModifierSnapshots } from '../../../entities/website-order';
import { HttpError } from '../../../shared/lib/http';

export async function loadWebsiteModifierSnapshots(
  tx: TenantTransaction,
  items: readonly { id: string; productId: string }[],
): Promise<Map<string, ModifierGroupSnapshotDto[]>> {
  const [snapshots, current] = await Promise.all([
    loadWebsiteOrderItemModifierSnapshots(
      tx,
      items.map((item) => item.id),
    ),
    loadProductModifierConfigs(
      tx,
      items.map((item) => item.productId),
    ),
  ]);
  for (const item of items) {
    for (const group of snapshots.get(item.id) ?? []) {
      const availableGroup = current
        .get(item.productId)
        ?.find((binding) => binding.id === group.bindingId);
      if (!availableGroup || availableGroup.modifierGroupId !== group.groupId)
        throw new HttpError(
          409,
          'Un grup de opțiuni nu mai este disponibil. Verificați comanda website.',
          WEBSITE_PRODUCT_UNAVAILABLE,
        );
      if (
        group.options.some(
          (choice) => !availableGroup.group.options.some((option) => option.id === choice.optionId),
        )
      )
        throw new HttpError(
          409,
          'O opțiune nu mai este disponibilă. Verificați comanda website.',
          WEBSITE_PRODUCT_UNAVAILABLE,
        );
    }
  }
  return snapshots;
}
