import type { TenantTransaction } from '@pos/db';
import type { CashMovementResolutionRequest, CashMovementResolutionResponse } from '@pos/contracts';
import type { AccessData } from '../../../entities/tenant-access';
import { lockShift, readCashClaim, retireCashClaim } from '../../../entities/cash-shift';
import { requireMovementAccess, requireMovementOwner } from './movement-access';
import { movementResult } from './movement-result';
export async function resolveMovement(
  tx: TenantTransaction,
  access: AccessData,
  actor: string,
  command: CashMovementResolutionRequest,
): Promise<{ response: CashMovementResolutionResponse; retired: boolean }> {
  requireMovementAccess(access, actor, command.locationId);
  const shift = await lockShift(tx, command.locationId, command.shiftId);
  requireMovementOwner(shift.ownerUserId, actor);
  const claim = await readCashClaim(tx, command, actor);
  if (claim?.status === 'SUCCEEDED') {
    const result = await movementResult(tx, claim.cashOperationId!);
    requireMovementAccess(access, actor, command.locationId, result.movement.amount);
    return { response: { status: 'SUCCEEDED', command, result }, retired: false };
  }
  if (!claim) await retireCashClaim(tx, access.org.id, actor, command);
  return { response: { status: 'RETIRED', command }, retired: !claim };
}
