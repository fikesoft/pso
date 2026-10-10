import type { TenantTransaction } from '@pos/db';
import type { StoredResponsibilityEvent } from './responsibility.types';
import type {
  OrderResponsibilityCommandResultDto,
  OrderResponsibilityEventDto,
} from '@pos/contracts/order-responsibilities';
import { assert } from '../../../shared/lib/http';
export async function responsibilityEventResponse(
  tx: TenantTransaction,
  event: StoredResponsibilityEvent,
): Promise<OrderResponsibilityEventDto> {
  const register = event.registerId
    ? { id: event.registerId, code: event.registerCode!, name: event.registerName! }
    : null;
  const shifts = await tx.cashShift.findMany({
    where: {
      id: {
        in: [event.sourceShiftId, event.targetShiftId].filter((id): id is string => id !== null),
      },
    },
  });
  const shift = (id: string | null) => {
    const row = shifts.find((s) => s.id === id);
    return row
      ? {
          id: row.id,
          registerId: row.registerId,
          registerCode: row.registerCode,
          registerName: row.registerName,
        }
      : null;
  };

  return {
    eventId: event.id,
    orderId: event.orderId,
    locationId: event.locationId,
    kind: event.kind as OrderResponsibilityEventDto['kind'],
    actorUserId: event.actorUserId,
    actorDisplayName: event.actorDisplayName,
    orderVersion: event.orderVersion,
    responsibilityVersion: event.version,
    previousState: event.previousState as OrderResponsibilityEventDto['previousState'],
    resultState: event.resultState as OrderResponsibilityEventDto['resultState'],
    orderNumber: event.orderNumber,
    orderTotal: event.orderTotal.toFixed(2),
    outstandingSnapshot: event.outstandingSnapshot.toFixed(2),
    fromOwner: event.fromOwnerUserId
      ? { userId: event.fromOwnerUserId, displayName: event.fromOwnerName! }
      : null,
    toOwner: event.toOwnerUserId
      ? { userId: event.toOwnerUserId, displayName: event.toOwnerName! }
      : null,
    sourceShift: shift(event.sourceShiftId),
    targetShift: shift(event.targetShiftId),
    targetRegister: event.kind === 'PREPARE_HANDOFF' ? register : null,
    handoffEventId: event.handoffEventId,
    reason: event.reason,
    managerReason: event.managerReason,
    source: event.sourceOrderEventId
      ? {
          orderEventId: event.sourceOrderEventId,
          paymentOperationId: event.paymentOperationId,
          checkoutId: event.checkoutId,
        }
      : null,
    createdAt: event.createdAt.toISOString(),
  };
}
export async function responsibilityCommandResponse(
  tx: TenantTransaction,
  event: StoredResponsibilityEvent,
): Promise<OrderResponsibilityCommandResultDto> {
  assert(
    event.kind === 'ASSIGN' || event.kind === 'PREPARE_HANDOFF' || event.kind === 'ACCEPT_HANDOFF',
    409,
    'Rezultatul nu este o comandă de responsabilitate.',
  );
  return {
    ...(await responsibilityEventResponse(tx, event)),
    kind: event.kind,
    commandKind: event.kind,
    reason: event.reason!,
  };
}
