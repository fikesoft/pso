import type { TenantTransaction } from '@pos/db';
import type { OrderResponsibilityCommandIdentity } from '@pos/contracts/order-responsibilities';
import type { AccessData } from '../../../entities/tenant-access';
import { assert } from '../../../shared/lib/http';
import { requireResponsibilityAction, canReadResponsibilityOrder } from './responsibility-access';
export async function responsibilityCommandAccess(
  tx: TenantTransaction,
  access: AccessData,
  actor: string,
  command: OrderResponsibilityCommandIdentity,
) {
  const order = await tx.order.findFirst({
    where: { id: command.orderId, locationId: command.locationId },
  });
  assert(order, 404, 'Comanda nu există.');
  assert(canReadResponsibilityOrder(access, actor, order));
  const shiftId =
    command.kind === 'PREPARE_HANDOFF' ? command.sourceShiftId : command.targetShiftId;
  const shift = await tx.cashShift.findFirst({
    where: { id: shiftId, locationId: command.locationId },
  });
  assert(shift, 404, 'Tura nu există.');
  requireResponsibilityAction(access, actor, command.locationId, command.kind, shift.ownerUserId);
  if (command.kind === 'ACCEPT_HANDOFF') {
    const event = await tx.orderResponsibilityEvent.findFirst({
      where: {
        id: command.handoffEventId,
        locationId: command.locationId,
        orderId: command.orderId,
        kind: 'PREPARE_HANDOFF',
      },
    });
    assert(event, 404, 'Predarea nu există.');
  }
  return { order, shift };
}
