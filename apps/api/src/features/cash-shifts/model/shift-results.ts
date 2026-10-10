import type { TenantTransaction } from '@pos/db';
import { shiftResponse, closingResponse } from '../../../entities/cash-shift';
import { assert } from '../../../shared/lib/http';
export async function openShiftResult(tx: TenantTransaction, shiftId: string) {
  const shift = await tx.cashShift.findUniqueOrThrow({ where: { id: shiftId } });
  return {
    shift: { ...shiftResponse(shift), status: 'OPEN' as const, version: 1, closedAt: null },
  };
}
export async function closeShiftResult(tx: TenantTransaction, shiftId: string) {
  const shift = await tx.cashShift.findUniqueOrThrow({ where: { id: shiftId } });
  const closing = await tx.cashClosing.findFirst({ where: { shiftId } });
  assert(closing, 500, 'Închiderea confirmată nu are snapshot.');
  return { shift: shiftResponse(shift), closing: closingResponse(closing) };
}
