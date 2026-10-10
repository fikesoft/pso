import { randomUUID } from 'node:crypto';
import type { TenantTransaction } from '../../src';
export async function writeCashMovement(
  tx: TenantTransaction,
  shiftId: string,
  direction: 'IN' | 'OUT',
  amount: string,
  options: { expectedVersion?: number; requestKey?: string; actor?: string } = {},
) {
  const shift = await tx.cashShift.findUniqueOrThrow({ where: { id: shiftId } });
  return tx.cashOperation.create({
    data: {
      organizationId: shift.organizationId,
      locationId: shift.locationId,
      registerId: shift.registerId,
      shiftId,
      kind: direction === 'IN' ? 'CASH_IN' : 'CASH_OUT',
      requestKey: options.requestKey ?? randomUUID(),
      requestHash: 'd'.repeat(64),
      actorUserId: options.actor ?? shift.ownerUserId,
      expectedVersion: options.expectedVersion ?? shift.version,
      cashShiftVersion: (options.expectedVersion ?? shift.version) + 1,
      amount,
      reason: 'Mișcare sintetică verificată',
    },
  });
}
