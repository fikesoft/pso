import { randomUUID } from 'node:crypto';
import type { TenantTransaction } from '../../src';
import type { DeliveryTestCommand } from './delivery.types';
export async function writeDelivery(
  tx: TenantTransaction,
  orderId: string,
  input: DeliveryTestCommand,
) {
  const order = await tx.order.findUniqueOrThrow({ where: { id: orderId } });
  const operation = await tx.deliveryOperation.create({
    data: {
      organizationId: order.organizationId,
      locationId: order.locationId,
      orderId,
      requestKey: randomUUID(),
      requestHash: 'e'.repeat(64),
      orderVersion: input.orderVersion ?? order.version + 1,
      toStatus: input.toStatus,
      courierUserId: input.courierUserId,
      actorUserId: order.updatedByUserId,
      reason: input.reason,
      ...input.operation,
    },
  });
  if (input.omit !== 'order')
    await tx.order.update({
      where: { id: orderId },
      data: {
        version: { increment: 1 },
        updatedByUserId: operation.actorUserId,
        deliveryStatus: operation.toStatus,
        deliveryCourierId: operation.courierUserId,
        deliveryCourierName: operation.courierName,
      },
    });
  if (input.omit !== 'event')
    await tx.orderStatusEvent.create({
      data: {
        organizationId: operation.organizationId,
        locationId: operation.locationId,
        orderId,
        kind: 'DELIVERY',
        fromStatus: operation.fromStatus,
        toStatus: operation.toStatus,
        requestKey: operation.requestKey,
        requestHash: operation.requestHash,
        orderVersion: operation.orderVersion,
        actorUserId: operation.actorUserId,
        reason: operation.reason,
        ...input.event,
      },
    });
  return operation;
}
