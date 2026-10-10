import type { TenantTransaction } from '@pos/db';
import type { AccessData } from '../../../entities/tenant-access';
import { courierResponse, courierWorkload } from '../../../entities/courier';
import type { CourierRow } from '../../../entities/courier';
import { assert } from '../../../shared/lib/http';
import { courierEligible } from './courier-access';
export async function courierView(tx: TenantTransaction, access: AccessData, row: CourierRow) {
  const user = access.users.find((value) => value.id === row.userId);
  assert(user, 404, 'Identitatea curierului nu există.');
  return courierResponse(
    row,
    user.displayName,
    courierEligible(access, row.userId, row.locationId),
    await courierWorkload(tx, access.org.id, row.locationId, row.userId),
  );
}
