import type { TenantTransaction } from '@pos/db';
import type { AuthorizationService } from '@pos/authz';
import { HttpError, assert } from '../../../shared/lib/http';
import { decimalUnits } from '../../../shared/lib/money';
import type { StoredCashSummary } from './cash-shift.types';
import { requireShiftRead } from './shift-access';
import { shiftSummaryResponse } from './shift-response';
export async function lockFinancialOrder(
  tx: TenantTransaction,
  locationId: string,
  orderId: string,
) {
  const rows = await tx.$queryRaw<
    Array<{ id: string }>
  >`SELECT id FROM "Order" WHERE id=${orderId}::uuid AND "locationId"=${locationId}::uuid FOR UPDATE`;
  assert(rows.length === 1, 404, 'Comanda nu există');
}
export async function lockShift(tx: TenantTransaction, locationId: string, shiftId: string) {
  const rows = await tx.$queryRaw<
    Array<{ id: string }>
  >`SELECT id FROM "CashShift" WHERE id=${shiftId}::uuid AND "locationId"=${locationId}::uuid FOR UPDATE`;
  assert(rows.length === 1, 404, 'Tura nu există');
  return tx.cashShift.findUniqueOrThrow({ where: { id: shiftId } });
}
/** Order must already be locked by a financial writer before entering this function. */
export async function requireFinancialShift(
  tx: TenantTransaction,
  service: AuthorizationService,
  organizationId: string,
  actor: string,
  locationId: string,
  shiftId?: string,
) {
  if (!shiftId)
    throw new HttpError(409, 'Selectați o tură proprie deschisă.', 'CASH_SHIFT_REQUIRED');
  requireShiftRead(service, organizationId, actor, locationId);
  const shift = await lockShift(tx, locationId, shiftId);
  if (shift.ownerUserId !== actor)
    throw new HttpError(403, 'Operațiunea necesită propria tură.', 'CASH_SHIFT_NOT_OWNER');
  if (shift.status !== 'OPEN')
    throw new HttpError(409, 'Tura nu mai este deschisă.', 'CASH_SHIFT_NOT_OPEN');
  return shift;
}
/** Scope preflight only: deliberately does not take a Shift lock before the Register stage. */
export async function preflightFinancialShift(
  tx: TenantTransaction,
  service: AuthorizationService,
  organizationId: string,
  actor: string,
  locationId: string,
  shiftId?: string,
) {
  if (!shiftId)
    throw new HttpError(409, 'Selectați o tură proprie deschisă.', 'CASH_SHIFT_REQUIRED');
  requireShiftRead(service, organizationId, actor, locationId);
  const shift = await tx.cashShift.findFirst({
    where: { id: shiftId, organizationId, locationId },
  });
  assert(shift, 404, 'Tura nu există');
  if (shift.ownerUserId !== actor)
    throw new HttpError(403, 'Operațiunea necesită propria tură.', 'CASH_SHIFT_NOT_OWNER');
  if (shift.status !== 'OPEN')
    throw new HttpError(409, 'Tura nu mai este deschisă.', 'CASH_SHIFT_NOT_OPEN');
  return shift;
}
export async function readShiftSummary(
  tx: TenantTransaction,
  organizationId: string,
  shiftId: string,
) {
  const [row] = await tx.$queryRaw<
    StoredCashSummary[]
  >`SELECT * FROM public.cash_shift_summary_v2(${organizationId}::uuid,${shiftId}::uuid)`;
  assert(row, 404, 'Tura nu există');
  return shiftSummaryResponse(row);
}
export async function requireCashAvailable(
  tx: TenantTransaction,
  organizationId: string,
  shiftId: string,
  amount: string,
) {
  const summary = await readShiftSummary(tx, organizationId, shiftId);
  if (decimalUnits(amount, 2) > decimalUnits(summary.expectedCash, 2))
    throw new HttpError(
      409,
      'Numerarul disponibil în tură este insuficient.',
      'CASH_BALANCE_INSUFFICIENT',
    );
}
