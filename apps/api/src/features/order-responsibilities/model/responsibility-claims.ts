import type { TenantTransaction } from '@pos/db';
import type {
  OrderResponsibilityCommandIdentity,
  OrderResponsibilityCommandResponse,
} from '@pos/contracts/order-responsibilities';
import type { AccessData } from '../../../entities/tenant-access';
import { responsibilityCommandResponse } from '../../../entities/order-responsibility';
import { HttpError } from '../../../shared/lib/http';
import { requireResponsibilitySnapshotRead } from './responsibility-access';
export function responsibilityConflict(): never {
  throw new HttpError(
    409,
    'Cheia aparține altei tentative.',
    'ORDER_RESPONSIBILITY_COMMAND_CONFLICT',
  );
}
export function responsibilityTargets(command: OrderResponsibilityCommandIdentity) {
  return {
    sourceShiftId: command.kind === 'PREPARE_HANDOFF' ? command.sourceShiftId : null,
    targetShiftId: command.kind !== 'PREPARE_HANDOFF' ? command.targetShiftId : null,
    handoffEventId: command.kind === 'ACCEPT_HANDOFF' ? command.handoffEventId : null,
  };
}
export async function readResponsibilityClaim(
  tx: TenantTransaction,
  actor: string,
  command: OrderResponsibilityCommandIdentity,
) {
  const claim = await tx.orderResponsibilityCommand.findFirst({
    where: { locationId: command.locationId, requestKey: command.requestKey },
  });
  if (!claim) return null;
  const targets = responsibilityTargets(command);
  if (
    claim.actorUserId !== actor ||
    claim.orderId !== command.orderId ||
    claim.kind !== command.kind ||
    claim.sourceShiftId !== targets.sourceShiftId ||
    claim.targetShiftId !== targets.targetShiftId ||
    claim.handoffEventId !== targets.handoffEventId
  )
    responsibilityConflict();
  return claim;
}
export async function responsibilityResult(
  tx: TenantTransaction,
  access: AccessData,
  actor: string,
  eventId: string,
): Promise<OrderResponsibilityCommandResponse> {
  const event = await tx.orderResponsibilityEvent.findUniqueOrThrow({ where: { id: eventId } });
  requireResponsibilitySnapshotRead(access, actor, event.locationId, event.orderTotal.toFixed(2));
  return { event: await responsibilityCommandResponse(tx, event) };
}
