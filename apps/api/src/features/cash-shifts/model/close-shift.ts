import { prepareResponsibilityClose } from '../../../entities/order-responsibility';
import type { TenantTransaction } from '@pos/db';
import type { CashShiftCloseRequest } from '@pos/contracts';
import type { AccessData } from '../../../entities/tenant-access';
import {
  readCashClaim,
  rejectRetiredCashClaim,
  requireShiftClose,
  lockShift,
  readShiftSummary,
} from '../../../entities/cash-shift';
import { HttpError, assert } from '../../../shared/lib/http';
import { requestHash } from '../../../shared/lib/idempotency';
import { decimalUnits } from '../../../shared/lib/money';
import { closeShiftResult } from './shift-results';
export async function closeShift(
  tx: TenantTransaction,
  access: AccessData,
  actor: string,
  shiftId: string,
  body: CashShiftCloseRequest,
) {
  let shift = await tx.cashShift.findFirst({ where: { id: shiftId, locationId: body.locationId } });
  assert(shift, 404, 'Tura nu există.');
  requireShiftClose(access.service, access.org.id, actor, body.locationId, shift.ownerUserId);
  const hash = requestHash({ shiftId, ...body });
  const command = {
    locationId: body.locationId,
    requestKey: body.requestKey,
    kind: 'CLOSE' as const,
    shiftId,
  };
  const claim = await readCashClaim(tx, command, actor);
  rejectRetiredCashClaim(claim?.status);
  if (claim) {
    if (claim.requestHash !== hash)
      throw new HttpError(409, 'Cheia a fost folosită pentru alte date.', 'CASH_COMMAND_CONFLICT');
    return { ...(await closeShiftResult(tx, shiftId)), replayed: true };
  }
  await prepareResponsibilityClose(tx, access.org.id, body.locationId, shiftId);
  const raced = await readCashClaim(tx, command, actor);
  if (raced) return closeShift(tx, access, actor, shiftId, body);
  shift = await lockShift(tx, body.locationId, shiftId);
  if (await tx.orderResponsibility.findFirst({ where: { shiftId, state: 'ASSIGNED' } }))
    throw new HttpError(
      409,
      'Tura are comenzi asumate nerezolvate.',
      'CASH_SHIFT_UNRESOLVED_ORDERS',
    );
  if (shift.status !== 'OPEN')
    throw new HttpError(409, 'Tura nu mai este deschisă.', 'CASH_SHIFT_NOT_OPEN');
  if (shift.version !== body.version)
    throw new HttpError(409, 'Tura a fost modificată. Reîncărcați.', 'CASH_SHIFT_VERSION_CONFLICT');
  if (shift.ownerUserId !== actor && !body.managerReason)
    throw new HttpError(
      400,
      'Indicați motivul închiderii turei altui operator.',
      'CASH_MANAGER_REASON_REQUIRED',
    );
  const summary = await readShiftSummary(tx, access.org.id, shiftId);
  if (
    decimalUnits(summary.expectedCash, 2) !== decimalUnits(body.countedCash, 2) &&
    !body.discrepancyReason
  )
    throw new HttpError(400, 'Explicați diferența de numerar.', 'CASH_DISCREPANCY_REASON_REQUIRED');
  await tx.cashOperation.create({
    data: {
      organizationId: access.org.id,
      locationId: body.locationId,
      shiftId,
      registerId: shift.registerId,
      kind: 'CLOSE',
      requestKey: body.requestKey,
      requestHash: hash,
      actorUserId: actor,
      expectedVersion: body.version,
      cashShiftVersion: body.version + 1,
      countedCash: body.countedCash,
      discrepancyReason: body.discrepancyReason,
      managerReason: body.managerReason,
    },
  });
  return { ...(await closeShiftResult(tx, shiftId)), replayed: false };
}
