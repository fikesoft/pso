import { randomUUID } from 'node:crypto';
import type { TenantTransaction } from '../../src';
import { distributeBill } from '../../../../apps/api/src/entities/bill-split';
import type { BillDivision } from '../../../../apps/api/src/entities/bill-split';
export async function writeBillSplit(
  tx: TenantTransaction,
  orderIds: string[],
  actorUserId: string,
  division: BillDivision = { mode: 'EQUAL', count: 3 },
  visitId?: string,
  corruptAllocation = false,
  requestKey = randomUUID(),
) {
  const orders = await tx.order.findMany({
    where: { id: { in: orderIds } },
    orderBy: { id: 'asc' },
  });
  if (orders.length !== orderIds.length) throw new Error('Fixture: comenzi lipsă');
  const first = orders[0]!;
  const distribution = distributeBill(
    orders.map((order) => ({ orderId: order.id, amount: order.total.toFixed(2) })),
    division,
  );
  const split = await tx.billSplit.create({
    data: {
      organizationId: first.organizationId,
      locationId: first.locationId,
      requestKey,
      requestHash: 'a'.repeat(64),
      actorUserId,
      scopeType: visitId ? 'VISIT' : 'ORDER',
      targetVisitId: visitId ?? null,
      targetOrderId: visitId ? null : first.id,
      mode: division.mode,
      partCount: distribution.parts.length,
      sourceCount: orders.length,
      total: distribution.total,
      currency: first.currency,
    },
  });
  const scope = {
    organizationId: first.organizationId,
    locationId: first.locationId,
    splitId: split.id,
  };
  for (const order of orders)
    await tx.billSplitSource.create({
      data: { ...scope, orderId: order.id, orderVersion: order.version, amount: order.total },
    });
  const parts = [];
  for (const row of distribution.parts) {
    const part = await tx.billPart.create({
      data: { ...scope, position: row.position, amount: row.amount },
    });
    parts.push(part);
    for (const allocation of row.allocations)
      await tx.billPartAllocation.create({
        data: {
          ...scope,
          partId: part.id,
          orderId: allocation.orderId,
          amount: corruptAllocation ? '0.01' : allocation.amount,
        },
      });
  }
  return { split, parts };
}
