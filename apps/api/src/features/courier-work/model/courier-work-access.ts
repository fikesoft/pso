import type { TenantTransaction } from '@pos/db';
import type { AccessData } from '../../../entities/tenant-access';
import { scopeFor, visibleLocations } from '../../../entities/tenant-access';
import { assert } from '../../../shared/lib/http';
export function canReadCourierWork(
  access: AccessData,
  actor: string,
  locationId: string,
  amount?: string,
) {
  const scope = {
    ...scopeFor(access.org.id, { scopeType: 'LOCATION', locationId }),
    ...(amount ? { amount } : {}),
  };
  return (
    access.service.canUse(actor, 'orders.read', scope) &&
    access.service.canUse(actor, 'delivery.update', scope)
  );
}
export async function requireCourierWork(
  tx: TenantTransaction,
  access: AccessData,
  actor: string,
  locationId: string,
) {
  assert(visibleLocations(access, actor).some((location) => location.id === locationId));
  assert(canReadCourierWork(access, actor, locationId));
  const profile = await tx.courier.findFirst({
    where: { organizationId: access.org.id, locationId, userId: actor },
  });
  assert(profile, 403, 'Înregistrați profilul de curier pentru această locație.');
  return profile;
}
