import type { AccessData } from '../../../entities/tenant-access';
import { scopeFor } from '../../../entities/tenant-access';
import { assert } from '../../../shared/lib/http';

export function requirePaymentAccess(
  access: AccessData,
  userId: string,
  locationId: string,
  orderTotal: string,
  permission?: 'payments.collect' | 'payments.refund',
  amount?: string,
) {
  const scope = scopeFor(access.org.id, { scopeType: 'LOCATION', locationId });
  assert(access.service.canUse(userId, 'orders.read', { ...scope, amount: orderTotal }));
  if (permission) assert(access.service.canUse(userId, permission, { ...scope, amount }));
}
