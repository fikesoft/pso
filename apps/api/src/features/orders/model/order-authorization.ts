import type { StoredOrder } from '../../../entities/order';
import type { AccessData } from '../../../entities/tenant-access';
import { scopeFor } from '../../../entities/tenant-access';
import { assert } from '../../../shared/lib/http';

export function requireOrderPermission(
  access: AccessData,
  userId: string,
  locationId: string,
  permission: 'orders.read' | 'orders.create' | 'orders.cancel' | 'orders.complete',
  amount?: string,
) {
  assert(
    access.service.canUse(userId, permission, {
      ...scopeFor(access.org.id, { scopeType: 'LOCATION', locationId }),
      ...(amount === undefined ? {} : { amount }),
    }),
  );
}

export function canReadOrder(
  access: AccessData,
  userId: string,
  order: Pick<StoredOrder, 'locationId' | 'total'>,
) {
  return access.service.canUse(userId, 'orders.read', {
    ...scopeFor(access.org.id, { scopeType: 'LOCATION', locationId: order.locationId }),
    amount: order.total.toString(),
  });
}
