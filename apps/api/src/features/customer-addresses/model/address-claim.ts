import type { TenantTransaction } from '@pos/db';
import { CUSTOMER_ADDRESS_CREATION_RETIRED } from '@pos/contracts';
import { assert, HttpError } from '../../../shared/lib/http';
export async function readAddressClaim(
  tx: TenantTransaction,
  customerId: string,
  locationId: string,
  requestKey: string,
  actor: string,
) {
  const claim = await tx.customerAddressCreationClaim.findFirst({
    where: { customerId, locationId, requestKey },
  });
  if (claim) assert(claim.actorUserId === actor, 409, 'Cheia încercării aparține altui autor');
  return claim;
}
export function rejectRetiredAddress() {
  throw new HttpError(
    409,
    'Încercarea de salvare a adresei a fost închisă definitiv. Inițiați o cerere nouă.',
    CUSTOMER_ADDRESS_CREATION_RETIRED,
  );
}
