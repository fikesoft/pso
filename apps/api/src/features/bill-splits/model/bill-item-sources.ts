import type { BillItemSourceDto } from '@pos/contracts';
import type { TenantTransaction } from '@pos/db';

export async function readBillItemSources(
  tx: TenantTransaction,
  organizationId: string,
  locationId: string,
  orderIds: string[],
): Promise<BillItemSourceDto[]> {
  const items = await tx.orderItem.findMany({
    where: { organizationId, locationId, orderId: { in: orderIds } },
    orderBy: { id: 'asc' },
  });
  const modifiers = await tx.orderItemModifier.findMany({
    where: { organizationId, locationId, orderItemId: { in: items.map((item) => item.id) } },
    orderBy: [{ modifierGroupSnapshotId: 'asc' }, { position: 'asc' }],
  });
  return items.map((item) => ({
    orderId: item.orderId,
    orderItemId: item.id,
    productName: item.productName,
    position: item.position,
    note: item.note,
    modifiers: modifiers
      .filter((modifier) => modifier.orderItemId === item.id)
      .map((modifier) => modifier.optionName),
    quantity: item.quantity.toFixed(3),
    amount: item.lineTotal.toFixed(2),
  }));
}
