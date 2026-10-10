import type { AccessData } from '../../../entities/tenant-access';
import { scopeFor } from '../../../entities/tenant-access';
import { requireShiftRead } from '../../../entities/cash-shift';
import { assert, HttpError } from '../../../shared/lib/http';
export function requireMovementAccess(
  access: AccessData,
  actor: string,
  locationId: string,
  amount?: string,
) {
  requireShiftRead(access.service, access.org.id, actor, locationId);
  assert(
    access.service.canUse(actor, 'cash.movements.create', {
      ...scopeFor(access.org.id, { scopeType: 'LOCATION', locationId }),
      ...(amount ? { amount } : {}),
    }),
  );
}
export function requireMovementOwner(owner: string, actor: string) {
  if (owner !== actor)
    throw new HttpError(403, 'Operațiunea necesită propria tură.', 'CASH_SHIFT_NOT_OWNER');
}
