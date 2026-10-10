import type { TenantTransaction } from '@pos/db';
import type { CashMovementListResponse, CashMovementRowDto } from '@pos/contracts';
import type { MovementCursorContext } from './movement.types';
import { readMovementCursor, movementCursor } from './movement-cursor';
export async function listMovements(
  tx: TenantTransaction,
  context: MovementCursorContext,
): Promise<CashMovementListResponse> {
  const after = context.cursor ? readMovementCursor(context, context.cursor) : undefined;
  const rows = await tx.cashMovement.findMany({
    where: {
      organizationId: context.organizationId,
      locationId: context.locationId,
      shiftId: context.shiftId,
      ...(after
        ? {
            OR: [
              { createdAt: { lt: new Date(after.createdAt) } },
              { createdAt: new Date(after.createdAt), id: { lt: after.id } },
            ],
          }
        : {}),
    },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    take: context.limit + 1,
  });
  const page = rows.slice(0, context.limit);
  const operations = await tx.cashOperation.findMany({
    where: {
      id: { in: page.flatMap((row) => (row.cashOperationId ? [row.cashOperationId] : [])) },
      kind: { in: ['CASH_IN', 'CASH_OUT'] },
    },
    select: { id: true, reason: true },
  });
  const reasons = new Map(operations.map((row) => [row.id, row.reason]));
  const movements: CashMovementRowDto[] = page.map((row) => ({
    id: row.id,
    locationId: row.locationId,
    shiftId: row.shiftId,
    kind: row.kind as CashMovementRowDto['kind'],
    direction: row.direction as 'IN' | 'OUT',
    amount: row.amount.toFixed(2),
    currency: 'MDL',
    actorUserId: row.actorUserId,
    createdAt: row.createdAt.toISOString(),
    reason: row.cashOperationId ? (reasons.get(row.cashOperationId) ?? null) : null,
    source: row.cashOperationId
      ? { kind: 'CASH_OPERATION', id: row.cashOperationId }
      : row.paymentId
        ? { kind: 'PAYMENT', id: row.paymentId }
        : { kind: 'REFUND', id: row.refundId! },
  }));
  return {
    movements,
    nextCursor: rows.length > context.limit ? movementCursor(context, page.at(-1)!) : null,
    timezone: context.timezone,
  };
}
