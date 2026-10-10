import type { TenantTransaction } from '@pos/db';
import type { StoredOrder } from '../../../entities/order';
import { assert } from '../../../shared/lib/http';
export async function requireDeliveryFee(tx: TenantTransaction, order: StoredOrder) {
  if (order.status !== 'DRAFT' || order.serviceType !== 'DELIVERY' || order.deliveryFeeCommandId)
    return;
  const configured = await tx.deliveryZone.findFirst({
    where: { organizationId: order.organizationId, locationId: order.locationId },
    select: { id: true },
  });
  assert(
    !configured,
    409,
    'Calculați și confirmați tariful de livrare înainte de confirmarea comenzii.',
  );
}
