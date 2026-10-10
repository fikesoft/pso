import type { TenantTransaction } from '@pos/db';
import type { CashMovementCreateRequest } from '@pos/contracts';
import type { AccessData } from '../../../entities/tenant-access';
import {
  lockShift,
  readCashClaim,
  rejectRetiredCashClaim,
  requireCashAvailable,
} from '../../../entities/cash-shift';
import { HttpError } from '../../../shared/lib/http';
import { requestHash } from '../../../shared/lib/idempotency';
import { requireMovementAccess, requireMovementOwner } from './movement-access';
import { movementResult } from './movement-result';
export async function createMovement(
  tx: TenantTransaction,
  access: AccessData,
  actor: string,
  shiftId: string,
  body: CashMovementCreateRequest,
) {
  requireMovementAccess(access, actor, body.locationId, body.amount);
  const shift = await lockShift(tx, body.locationId, shiftId);
  requireMovementOwner(shift.ownerUserId, actor);
  const kind = body.direction === 'IN' ? 'CASH_IN' : 'CASH_OUT';
  const command = {
    locationId: body.locationId,
    requestKey: body.requestKey,
    kind,
    shiftId,
  } as const;
  const hash = requestHash({ shiftId, ...body });
  const claim = await readCashClaim(tx, command, actor);
  rejectRetiredCashClaim(claim?.status);
  if (claim) {
    if (claim.requestHash !== hash)
      throw new HttpError(409, 'Cheia a fost folosită pentru alte date.', 'CASH_COMMAND_CONFLICT');
    return { ...(await movementResult(tx, claim.cashOperationId!)), replayed: true };
  }
  if (shift.status !== 'OPEN')
    throw new HttpError(409, 'Tura nu mai este deschisă.', 'CASH_SHIFT_NOT_OPEN');
  if (shift.version !== body.version)
    throw new HttpError(409, 'Tura a fost modificată. Reîncărcați.', 'CASH_SHIFT_VERSION_CONFLICT');
  if (body.direction === 'OUT') await requireCashAvailable(tx, access.org.id, shiftId, body.amount);
  const operation = await tx.cashOperation.create({
    data: {
      organizationId: access.org.id,
      locationId: body.locationId,
      registerId: shift.registerId,
      shiftId,
      kind,
      requestKey: body.requestKey,
      requestHash: hash,
      actorUserId: actor,
      expectedVersion: body.version,
      cashShiftVersion: body.version + 1,
      amount: body.amount,
      reason: body.reason,
    },
  });
  return { ...(await movementResult(tx, operation.id)), replayed: false };
}
