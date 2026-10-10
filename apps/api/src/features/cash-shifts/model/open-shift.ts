import { randomUUID } from 'node:crypto';
import type { TenantTransaction } from '@pos/db';
import type { CashShiftOpenRequest } from '@pos/contracts';
import type { AccessData } from '../../../entities/tenant-access';
import {
  readCashClaim,
  rejectRetiredCashClaim,
  requireShiftOpen,
} from '../../../entities/cash-shift';
import { HttpError, assert } from '../../../shared/lib/http';
import { requestHash } from '../../../shared/lib/idempotency';
import { openShiftResult } from './shift-results';
export async function openShift(
  tx: TenantTransaction,
  access: AccessData,
  actor: string,
  registerId: string,
  body: CashShiftOpenRequest,
) {
  requireShiftOpen(access.service, access.org.id, actor, body.locationId, body.openingAmount);
  const command = {
    locationId: body.locationId,
    requestKey: body.requestKey,
    kind: 'OPEN' as const,
    registerId,
  };
  const hash = requestHash({ registerId, ...body });
  const claim = await readCashClaim(tx, command, actor);
  rejectRetiredCashClaim(claim?.status);
  if (claim) {
    if (claim.requestHash !== hash)
      throw new HttpError(409, 'Cheia a fost folosită pentru alte date.', 'CASH_COMMAND_CONFLICT');
    const operation = await tx.cashOperation.findUniqueOrThrow({
      where: { id: claim.cashOperationId! },
    });
    return { ...(await openShiftResult(tx, operation.shiftId)), replayed: true };
  }
  const found = await tx.$queryRaw<
    Array<{ id: string }>
  >`SELECT id FROM "CashRegister" WHERE id=${registerId}::uuid AND "locationId"=${body.locationId}::uuid FOR UPDATE`;
  assert(found.length === 1, 404, 'Casa nu există');
  const register = await tx.cashRegister.findUniqueOrThrow({ where: { id: registerId } });
  if (register.status !== 'ACTIVE')
    throw new HttpError(409, 'Casa este arhivată.', 'CASH_REGISTER_ARCHIVED');
  if (await tx.cashShift.findFirst({ where: { registerId, status: 'OPEN' } }))
    throw new HttpError(409, 'Casa are deja o tură deschisă.', 'CASH_SHIFT_ALREADY_OPEN');
  const shift = await tx.cashShift.create({
    data: {
      organizationId: access.org.id,
      locationId: body.locationId,
      registerId,
      ownerUserId: actor,
      registerCode: register.code,
      registerName: register.name,
      ownerDisplayName: access.currentUser.displayName,
      openingAmount: body.openingAmount,
      lastActivityId: randomUUID(),
    },
  });
  await tx.cashOperation.create({
    data: {
      organizationId: access.org.id,
      locationId: body.locationId,
      shiftId: shift.id,
      registerId,
      kind: 'OPEN',
      requestKey: body.requestKey,
      requestHash: hash,
      actorUserId: actor,
      cashShiftVersion: 1,
      openingAmount: body.openingAmount,
    },
  });
  return { ...(await openShiftResult(tx, shift.id)), replayed: false };
}
