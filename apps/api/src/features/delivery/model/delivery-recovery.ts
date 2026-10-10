import type { TenantTransaction } from '@pos/db';
import type { DeliveryResolution } from '@pos/contracts';
import type { AccessData } from '../../../entities/tenant-access';
import { assert } from '../../../shared/lib/http';
import { deliveryAccess } from './delivery-access';
import { deliveryOperationResponse } from './operation-response';
export async function resolveDelivery(
  tx: TenantTransaction,
  access: AccessData,
  actor: string,
  orderId: string,
  body: DeliveryResolution,
) {
  const order = await tx.order.findFirst({
    where: { id: orderId, organizationId: access.org.id, locationId: body.locationId },
  });
  assert(order && order.serviceType === 'DELIVERY', 404, 'Livrarea nu există.');
  const rights = deliveryAccess(access, actor, order);
  const managerial = body.status === 'ASSIGNED' || body.status === 'WAITING_COURIER';
  assert(rights.canAssign || (!managerial && rights.canUpdate));
  const previous = await tx.deliveryOperation.findFirst({
    where: {
      organizationId: access.org.id,
      locationId: body.locationId,
      requestKey: body.requestKey,
    },
  });
  if (previous) {
    assert(
      previous.orderId === orderId &&
        previous.actorUserId === actor &&
        previous.toStatus === body.status,
      409,
      'Cheia aparține altei operațiuni.',
    );
    return {
      result: {
        status: 'SUCCEEDED' as const,
        locationId: body.locationId,
        orderId,
        requestKey: body.requestKey,
        operation: deliveryOperationResponse(previous),
      },
      retired: null,
    };
  }
  const existing = await tx.deliveryRequestRetirement.findFirst({
    where: {
      organizationId: access.org.id,
      locationId: body.locationId,
      requestKey: body.requestKey,
    },
  });
  if (existing)
    assert(
      existing.orderId === orderId &&
        existing.actorUserId === actor &&
        existing.toStatus === body.status,
      409,
      'Cheia aparține altei operațiuni.',
    );
  const retired =
    existing ??
    (await tx.deliveryRequestRetirement.create({
      data: {
        organizationId: access.org.id,
        locationId: body.locationId,
        orderId,
        actorUserId: actor,
        requestKey: body.requestKey,
        toStatus: body.status,
      },
    }));
  return {
    result: {
      status: 'RETIRED' as const,
      locationId: body.locationId,
      orderId,
      requestKey: body.requestKey,
      toStatus: body.status,
    },
    retired: existing ? null : retired,
  };
}
