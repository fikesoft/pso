import type { StoredOrder } from '../../../entities/order';
import type { AccessData } from '../../../entities/tenant-access';
import { scopeFor } from '../../../entities/tenant-access';
import { assert } from '../../../shared/lib/http';

export function deliveryAccess(access: AccessData, userId: string, order: StoredOrder) {
  const scope = {
    ...scopeFor(access.org.id, { scopeType: 'LOCATION', locationId: order.locationId }),
    amount: order.total.toFixed(2),
  };
  assert(access.service.canUse(userId, 'orders.read', scope));
  return {
    canAssign: access.service.canUse(userId, 'delivery.assign', scope),
    canUpdate:
      order.deliveryCourierId === userId && access.service.canUse(userId, 'delivery.update', scope),
    eligible: (id: string) =>
      access.service.canUse(id, 'orders.read', scope) &&
      access.service.canUse(id, 'delivery.update', scope),
  };
}
