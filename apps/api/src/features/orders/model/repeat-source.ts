import type { OrderRepeatSource } from '@pos/contracts';
import { effectiveOrderStatus } from '../../../entities/order';
import type { StoredOrder } from '../../../entities/order';
export function repeatSource(order: StoredOrder): OrderRepeatSource {
  return {
    id: order.id,
    number: order.number,
    locationId: order.locationId,
    status: effectiveOrderStatus(order.status, order.kitchenStatus),
    version: order.version,
    createdAt: order.createdAt.toISOString(),
    total: order.total.toFixed(2),
    currency: 'MDL',
  };
}
