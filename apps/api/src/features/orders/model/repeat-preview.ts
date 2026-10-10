import { assert } from '../../../shared/lib/http';
import { ORDER_REPEAT_MAX_ITEMS } from '../config/order-repeat.constants';
import type { OrderRepeatPreviewResponse } from '@pos/contracts';
import type { TenantTransaction } from '@pos/db';
import { catalogProductResponse } from '../../../entities/catalog-product';
import { loadProductModifierConfigs } from '../../../entities/catalog-modifiers';
import { productImageUrl } from '../../../entities/file-assets';
import { loadScheduleAvailability } from '../../../entities/menu-schedule';
import { loadOrderItemModifierSnapshots } from '../../../entities/order';
import type { StoredOrder } from '../../../entities/order';
import type { AccessData } from '../../../entities/tenant-access';
import { scopeFor } from '../../../entities/tenant-access';
import { totalAmount } from '../../../shared/lib/money';
import { repeatLine } from './repeat-line';
import { repeatSource } from './repeat-source';
export async function repeatPreview(
  tx: TenantTransaction,
  access: AccessData,
  userId: string,
  source: StoredOrder,
  locationId: string,
): Promise<OrderRepeatPreviewResponse> {
  const items = await tx.orderItem.findMany({
    where: { orderId: source.id },
    orderBy: { position: 'asc' },
    take: ORDER_REPEAT_MAX_ITEMS + 1,
  });
  assert(
    items.length <= ORDER_REPEAT_MAX_ITEMS,
    413,
    'Comanda depășește limita de linii pentru repetare.',
  );
  const ids = [...new Set(items.map((item) => item.productId))];
  const [timestamp] = await tx.$queryRaw<
    Array<{ instant: Date }>
  >`SELECT transaction_timestamp() AS instant`;
  const [products, local, modifiers, schedule, snapshots] = await Promise.all([
    tx.product.findMany({ where: { id: { in: ids }, status: 'ACTIVE' } }),
    tx.locationProduct.findMany({ where: { locationId, productId: { in: ids } } }),
    loadProductModifierConfigs(tx, ids),
    loadScheduleAvailability(tx, locationId, ids, timestamp!.instant),
    loadOrderItemModifierSnapshots(
      tx,
      items.map((item) => item.id),
    ),
  ]);
  const catalog = products.map((product) =>
    catalogProductResponse(
      product,
      locationId,
      local.find((entry) => entry.productId === product.id),
      modifiers.get(product.id) ?? [],
      schedule.get(product.id) ?? null,
      productImageUrl(product.id, locationId, product.imageAssetId),
    ),
  );
  const lines = items.map((item) =>
    repeatLine(
      item,
      snapshots.get(item.id) ?? [],
      catalog.find((product) => product.id === item.productId),
    ),
  );
  const estimatedTotal =
    lines.length && lines.every((line) => line.candidate)
      ? totalAmount(lines.map((line) => line.currentLineTotal!))
      : null;
  const amountAllowed =
    estimatedTotal === null
      ? null
      : access.service.canUse(userId, 'orders.create', {
          ...scopeFor(access.org.id, { scopeType: 'LOCATION', locationId }),
          amount: estimatedTotal,
        });
  return {
    source: repeatSource(source),
    locationId,
    checkedAt: timestamp!.instant.toISOString(),
    currency: 'MDL',
    products: catalog,
    lines,
    estimatedTotal,
    amountAllowed,
    canCreate: amountAllowed === true,
  };
}
