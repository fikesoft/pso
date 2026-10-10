import type { AccessData } from '../../../entities/tenant-access';
import { requireShiftRead } from '../../../entities/cash-shift';
import { assert, HttpError } from '../../../shared/lib/http';
import type { ResponsibilityOrder } from './responsibility.types';
export function responsibilityScope(access: AccessData, locationId: string) {
  return { organizationId: access.org.id, scopeType: 'LOCATION' as const, locationId };
}
export function canReadResponsibilityOrder(
  access: AccessData,
  actor: string,
  order: ResponsibilityOrder,
) {
  return access.service.canUse(actor, 'orders.read', {
    ...responsibilityScope(access, order.locationId),
    amount: order.total.toFixed(2),
  });
}
export function requireResponsibilityRead(access: AccessData, actor: string, locationId: string) {
  requireShiftRead(access.service, access.org.id, actor, locationId);
  const scope = responsibilityScope(access, locationId);
  assert(access.service.canUse(actor, 'orders.read', scope));
}
export function requireResponsibilityAction(
  access: AccessData,
  actor: string,
  locationId: string,
  kind: string,
  owner: string,
) {
  requireShiftRead(access.service, access.org.id, actor, locationId, owner);
  const scope = responsibilityScope(access, locationId);
  if (owner !== actor && kind !== 'PREPARE_HANDOFF')
    throw new HttpError(403, 'Acțiunea necesită propria tură.', 'ORDER_RESPONSIBILITY_NOT_OWNER');
  assert(
    access.service.canUse(
      actor,
      owner === actor ? 'orders.handoff' : 'orders.handoff-others',
      scope,
    ),
  );
}
export function requireResponsibilitySnapshotRead(
  access: AccessData,
  actor: string,
  locationId: string,
  amount: string,
) {
  assert(
    access.service.canUse(actor, 'orders.read', {
      ...responsibilityScope(access, locationId),
      amount,
    }),
  );
}
