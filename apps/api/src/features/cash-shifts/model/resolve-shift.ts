import type { TenantTransaction } from '@pos/db';
import type { CashShiftResolutionRequest, CashShiftResolutionResponse } from '@pos/contracts';
import type { AccessData } from '../../../entities/tenant-access';
import {
  readCashClaim,
  retireCashClaim,
  requireShiftOpen,
  requireShiftClose,
} from '../../../entities/cash-shift';
import { assert } from '../../../shared/lib/http';
import { openShiftResult, closeShiftResult } from './shift-results';
export async function resolveShift(
  tx: TenantTransaction,
  access: AccessData,
  actor: string,
  command: CashShiftResolutionRequest,
): Promise<CashShiftResolutionResponse> {
  if (command.kind === 'OPEN')
    requireShiftOpen(access.service, access.org.id, actor, command.locationId);
  else {
    const shift = await tx.cashShift.findFirst({
      where: { id: command.shiftId, locationId: command.locationId },
    });
    assert(shift, 404, 'Tura nu există');
    requireShiftClose(access.service, access.org.id, actor, command.locationId, shift.ownerUserId);
  }
  const claim = await readCashClaim(tx, command, actor);
  if (claim?.status === 'SUCCEEDED') {
    const operation = await tx.cashOperation.findUniqueOrThrow({
      where: { id: claim.cashOperationId! },
    });
    if (command.kind === 'OPEN') {
      requireShiftOpen(
        access.service,
        access.org.id,
        actor,
        command.locationId,
        operation.openingAmount!.toFixed(2),
      );
      return { status: 'SUCCEEDED', command, result: await openShiftResult(tx, operation.shiftId) };
    }
    return { status: 'SUCCEEDED', command, result: await closeShiftResult(tx, operation.shiftId) };
  }
  if (!claim) await retireCashClaim(tx, access.org.id, actor, command);
  return { status: 'RETIRED', command };
}
