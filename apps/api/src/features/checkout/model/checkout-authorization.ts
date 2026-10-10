import type { CheckoutMode } from '@pos/contracts';
import type { StoredOrder } from '../../../entities/order';
import type { AccessData } from '../../../entities/tenant-access';
import { scopeFor } from '../../../entities/tenant-access';
import { assert } from '../../../shared/lib/http';

export function requireCheckoutAccess(
  access: AccessData,
  userId: string,
  order: StoredOrder,
  mode?: CheckoutMode,
) {
  const scope = {
    ...scopeFor(access.org.id, { scopeType: 'LOCATION', locationId: order.locationId }),
    amount: order.total.toFixed(2),
  };
  assert(access.service.canUse(userId, 'orders.read', scope));
  if (mode)
    assert(
      access.service.canUse(userId, mode === 'DEMO' ? 'orders.create' : 'payments.collect', scope),
    );
}
