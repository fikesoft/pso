import { randomUUID } from 'node:crypto';
import type { TenantTransaction } from '../../src';
import { distributeBillItems } from '../../../../apps/api/src/entities/bill-split';
import type {
  BillItemDistribution,
  BillItemSource,
} from '../../../../apps/api/src/entities/bill-split';

export async function writeBillItemSplit(
  tx: TenantTransaction,
  orderId: string,
  actorUserId: string,
  mutate?: (sources: BillItemSource[], distribution: BillItemDistribution) => void,
) {
  const order = await tx.order.findUniqueOrThrow({ where: { id: orderId } });
  const items = await tx.orderItem.findMany({ where: { orderId } });
  const sources = items.map((item) => ({
    orderId,
    orderItemId: item.id,
    quantity: item.quantity.toFixed(3),
    amount: item.lineTotal.toFixed(2),
  }));
  const distribution = distributeBillItems(sources, {
    mode: 'ITEMS',
    parts: ['0.300', '0.350', '0.350'].map((quantity) => ({
      items: sources.map((item) => ({ orderItemId: item.orderItemId, quantity })),
    })),
  });
  mutate?.(sources, distribution);
  const split = await tx.billSplit.create({
    data: {
      organizationId: order.organizationId,
      locationId: order.locationId,
      requestKey: randomUUID(),
      requestHash: 'b'.repeat(64),
      actorUserId,
      scopeType: 'ORDER',
      targetOrderId: orderId,
      mode: 'ITEMS',
      partCount: distribution.parts.length,
      sourceCount: 1,
      total: distribution.total,
      currency: 'MDL',
    },
  });
  const scope = {
    organizationId: order.organizationId,
    locationId: order.locationId,
    splitId: split.id,
  };
  await tx.billSplitSource.create({
    data: { ...scope, orderId, orderVersion: order.version, amount: order.total },
  });
  await tx.billSplitItem.createMany({ data: sources.map((source) => ({ ...scope, ...source })) });
  const parts = [];
  for (const row of distribution.parts) {
    const part = await tx.billPart.create({
      data: { ...scope, position: row.position, amount: row.amount },
    });
    parts.push(part);
    await tx.billPartAllocation.createMany({
      data: row.allocations.map((allocation) => ({ ...scope, partId: part.id, ...allocation })),
    });
    await tx.billPartItem.createMany({
      data: row.items.map((item) => ({ ...scope, partId: part.id, ...item })),
    });
  }
  return { split, parts, sources, distribution };
}
