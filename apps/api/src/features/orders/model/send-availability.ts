import type { TenantTransaction } from '@pos/db';
import { loadProductModifierConfigs } from '../../../entities/catalog-modifiers';
import { requireScheduleAvailability } from '../../../entities/menu-schedule';
import { loadOrderItemModifierSnapshots } from '../../../entities/order';
import type { StoredOrderItem } from '../../../entities/order';
import { assert } from '../../../shared/lib/http';

export async function requireSendAvailability(
  tx: TenantTransaction,
  locationId: string,
  items: readonly StoredOrderItem[],
) {
  const productIds = [...new Set(items.map((item) => item.productId))];
  await requireScheduleAvailability(tx, locationId, productIds);
  const [products, local, configurations, snapshots] = await Promise.all([
    tx.product.findMany({ where: { id: { in: productIds }, status: 'ACTIVE' } }),
    tx.locationProduct.findMany({
      where: { locationId, productId: { in: productIds }, enabled: true },
    }),
    loadProductModifierConfigs(tx, productIds),
    loadOrderItemModifierSnapshots(
      tx,
      items.map((item) => item.id),
    ),
  ]);
  const activeProducts = new Set(products.map((product) => product.id));
  const availableProducts = new Set(local.map((product) => product.productId));
  for (const item of items) {
    assert(
      activeProducts.has(item.productId) && availableProducts.has(item.productId),
      409,
      'Un produs nu mai este disponibil în această locație. Verificați ciorna.',
    );
    for (const snapshot of snapshots.get(item.id) ?? []) {
      const binding = configurations
        .get(item.productId)
        ?.find((value) => value.id === snapshot.bindingId);
      assert(
        binding && binding.modifierGroupId === snapshot.groupId,
        409,
        'Un grup de modificatori nu mai este disponibil. Verificați ciorna.',
      );
      assert(
        snapshot.options.every((choice) =>
          binding.group.options.some((option) => option.id === choice.optionId),
        ),
        409,
        'O opțiune selectată nu mai este disponibilă. Verificați ciorna.',
      );
    }
  }
}
