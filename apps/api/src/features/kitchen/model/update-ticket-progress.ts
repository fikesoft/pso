import type { TenantTransaction } from '@pos/db';
import type { StoredTicket } from '../../../entities/order';
import { effectiveKitchenStatus, effectiveOrderStatus } from '../../../entities/order';
import { assert } from '../../../shared/lib/http';
export async function updateTicketProgress(
  tx: TenantTransaction,
  current: StoredTicket,
  status: string,
  actorUserId: string,
) {
  const order = await tx.order.findUnique({ where: { id: current.orderId } });
  assert(
    order &&
      ['CONFIRMED', 'IN_PROGRESS'].includes(
        effectiveOrderStatus(order.status, order.kitchenStatus),
      ),
    409,
    'Comanda nu mai poate fi preparată',
  );
  const ticket = await tx.kitchenTicket.update({
    where: { id: current.id, version: current.version },
    data: { status, updatedByUserId: actorUserId, version: { increment: 1 } },
  });
  if (effectiveKitchenStatus(current.status) === status) return ticket;
  const packing = await tx.packingSession.findFirst({
    where: { organizationId: current.organizationId, orderId: current.orderId },
    select: { handoverRequired: true },
  });
  const nextStage = status === 'READY' && !packing?.handoverRequired ? 'READY' : 'IN_PROGRESS';
  const previousStage = effectiveOrderStatus(order.status, order.kitchenStatus);
  await tx.order.update({
    where: { id: order.id },
    data: {
      status: nextStage,
      kitchenStatus: status,
      updatedByUserId: actorUserId,
      version: { increment: 1 },
    },
  });
  const event = {
    organizationId: current.organizationId,
    locationId: current.locationId,
    orderId: current.orderId,
    actorUserId,
  };
  await tx.orderStatusEvent.createMany({
    data: [
      {
        ...event,
        kind: 'KITCHEN',
        fromStatus: effectiveKitchenStatus(current.status),
        toStatus: status,
      },
      ...(previousStage !== nextStage
        ? [{ ...event, kind: 'ORDER', fromStatus: previousStage, toStatus: nextStage }]
        : []),
    ],
  });
  return ticket;
}
