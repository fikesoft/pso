import type { TenantTransaction } from '@pos/db';
import type { BillCollectionResult } from '@pos/contracts';
import { assert } from '../../../shared/lib/http';
export async function billCollectionResponse(
  tx: TenantTransaction,
  id: string,
): Promise<BillCollectionResult> {
  const row = await tx.billCollection.findUniqueOrThrow({ where: { id } });
  assert(row.status === 'SUCCEEDED', 409, 'Tentativa a fost retrasă.');
  const operations = await tx.paymentOperation.findMany({
    where: { billCollectionId: id },
    orderBy: { orderId: 'asc' },
  });
  return {
    id,
    partId: row.partId,
    locationId: row.locationId,
    requestKey: row.requestKey,
    amount: row.amount!.toFixed(2),
    receivedAmount: row.receivedAmount!.toFixed(2),
    method: row.method as 'CASH' | 'CARD',
    cashShiftId: row.cashShiftId!,
    actorUserId: row.actorUserId,
    createdAt: row.createdAt.toISOString(),
    operations: operations.map((op) => ({
      orderId: op.orderId,
      operationId: op.id,
      amount: op.amount.toFixed(2),
    })),
  };
}
