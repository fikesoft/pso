import type { TenantTransaction } from '@pos/db';
import type { CashMovementCreateResponse } from '@pos/contracts';
export async function movementResult(
  tx: TenantTransaction,
  cashOperationId: string,
): Promise<CashMovementCreateResponse> {
  const operation = await tx.cashOperation.findUniqueOrThrow({ where: { id: cashOperationId } });
  const movement = await tx.cashMovement.findFirstOrThrow({ where: { cashOperationId } });
  if (
    !operation.amount ||
    !operation.reason ||
    (operation.kind !== 'CASH_IN' && operation.kind !== 'CASH_OUT')
  )
    throw new Error('Sursa mișcării nu este o operațiune de numerar.');
  return {
    movement: {
      id: movement.id,
      cashOperationId,
      locationId: movement.locationId,
      shiftId: movement.shiftId,
      shiftVersion: operation.cashShiftVersion,
      requestKey: operation.requestKey,
      kind: operation.kind,
      direction: operation.kind === 'CASH_IN' ? 'IN' : 'OUT',
      amount: operation.amount.toFixed(2),
      currency: 'MDL',
      reason: operation.reason,
      actorUserId: operation.actorUserId,
      createdAt: operation.createdAt.toISOString(),
    },
  };
}
