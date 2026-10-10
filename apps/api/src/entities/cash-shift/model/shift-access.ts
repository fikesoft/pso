import type { AuthorizationService } from '@pos/authz';
import { assert } from '../../../shared/lib/http';
export function requireShiftRead(
  service: AuthorizationService,
  organizationId: string,
  actor: string,
  locationId: string,
  owner?: string,
) {
  const scope = { organizationId, scopeType: 'LOCATION' as const, locationId };
  assert(service.canUse(actor, 'cash.registers.read', scope));
  assert(service.canUse(actor, 'cash.shifts.read', scope));
  if (owner !== undefined && owner !== actor)
    assert(service.canUse(actor, 'cash.reports.read', scope));
}
export function requireShiftOpen(
  service: AuthorizationService,
  organizationId: string,
  actor: string,
  locationId: string,
  amount?: string,
) {
  requireShiftRead(service, organizationId, actor, locationId);
  assert(
    service.canUse(actor, 'cash.shifts.open', {
      organizationId,
      scopeType: 'LOCATION',
      locationId,
      ...(amount === undefined ? {} : { amount }),
    }),
  );
}
export function requireShiftClose(
  service: AuthorizationService,
  organizationId: string,
  actor: string,
  locationId: string,
  owner: string,
) {
  requireShiftRead(service, organizationId, actor, locationId, owner);
  const scope = { organizationId, scopeType: 'LOCATION' as const, locationId };
  assert(service.canUse(actor, 'cash.shifts.close', scope));
  if (owner !== actor) assert(service.canUse(actor, 'cash.shifts.close-others', scope));
}
