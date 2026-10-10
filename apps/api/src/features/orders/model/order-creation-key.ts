import { ORDER_CREATION_RETIRED } from '@pos/contracts';
import type { TenantTransaction } from '@pos/db';
import { HttpError } from '../../../shared/lib/http';

export { validateIdempotencyHeader as validateOrderCreationHeader } from '../../../shared/lib/idempotency-header';

export async function requireOpenCreationKey(
  tx: TenantTransaction,
  locationId: string,
  requestKey: string,
) {
  const retired = await tx.orderCreationClaim.findFirst({
    where: { locationId, requestKey, status: 'RETIRED' },
  });
  if (retired)
    throw new HttpError(
      409,
      'Încercarea de creare a fost închisă definitiv. Inițiați o cerere nouă.',
      ORDER_CREATION_RETIRED,
    );
}
