import type { AccessData } from '../../../entities/tenant-access';
import { scopeFor, visibleLocations } from '../../../entities/tenant-access';
import { assert } from '../../../shared/lib/http';
export function courierEligible(access: AccessData, userId: string, locationId: string) {
  const scope = scopeFor(access.org.id, { scopeType: 'LOCATION', locationId });
  return (
    visibleLocations(access, userId).some((value) => value.id === locationId) &&
    access.service.canUse(userId, 'orders.read', scope) &&
    access.service.canUse(userId, 'delivery.update', scope)
  );
}
export function requireCourierRead(
  access: AccessData,
  actor: string,
  locationId: string,
  ownUserId?: string,
) {
  assert(visibleLocations(access, actor).some((value) => value.id === locationId));
  const scope = scopeFor(access.org.id, { scopeType: 'LOCATION', locationId });
  assert(
    access.service.canUse(actor, 'couriers.read', scope) ||
      (actor === ownUserId && access.service.canUse(actor, 'couriers.availability', scope)),
  );
}
export function requireCourierCommand(
  access: AccessData,
  actor: string,
  locationId: string,
  action: string,
  subject?: string,
) {
  requireCourierRead(
    access,
    actor,
    locationId,
    action === 'SET_AVAILABILITY' ? subject : undefined,
  );
  const scope = scopeFor(access.org.id, { scopeType: 'LOCATION', locationId });
  assert(
    (action === 'SET_AVAILABILITY' &&
      subject === actor &&
      access.service.canUse(actor, 'couriers.availability', scope)) ||
      access.service.canUse(actor, 'couriers.manage', scope),
  );
}
