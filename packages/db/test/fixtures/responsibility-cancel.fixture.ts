import { randomUUID } from 'node:crypto';
import type { TenantTransaction } from '../../src';
export async function cancelResponsibilityOrder(tx: TenantTransaction, orderId: string) {
  const order = await tx.order.findUniqueOrThrow({ where: { id: orderId } });
  const updated = await tx.order.update({
    where: { id: orderId },
    data: { status: 'CANCELLED', version: { increment: 1 } },
  });
  return tx.orderStatusEvent.create({
    data: {
      organizationId: order.organizationId,
      locationId: order.locationId,
      orderId,
      kind: 'ORDER',
      fromStatus: order.status,
      toStatus: 'CANCELLED',
      actorUserId: order.updatedByUserId,
      reason: 'Anulare sintetică autorizată',
      orderVersion: updated.version,
      requestKey: randomUUID(),
      requestHash: 'e'.repeat(64),
    },
  });
}
