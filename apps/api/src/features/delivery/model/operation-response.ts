import type { TenantTransaction } from '@pos/db';
export function deliveryOperationResponse(
  operation: Awaited<ReturnType<TenantTransaction['deliveryOperation']['findFirstOrThrow']>>,
) {
  return {
    id: operation.id,
    fromStatus: operation.fromStatus,
    toStatus: operation.toStatus,
    previousCourierId: operation.previousCourierId,
    courierUserId: operation.courierUserId,
    courierName: operation.courierName,
    actorUserId: operation.actorUserId,
    reason: operation.reason,
    orderVersion: operation.orderVersion,
    createdAt: operation.createdAt.toISOString(),
  };
}
