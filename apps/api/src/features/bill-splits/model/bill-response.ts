import { readBillItemSources } from './bill-item-sources';
import type { BillContext, BillSplitDto } from '@pos/contracts';
import type { TenantTransaction } from '@pos/db';
import { readBillBalances } from '../../../entities/bill-split';
import { totalAmount } from '../../../shared/lib/money';
import type { AccessData } from '../../../entities/tenant-access';
import { assert } from '../../../shared/lib/http';
import { requireBillAccess, requireBillOrderRead } from './bill-access';
export async function readBill(
  tx: TenantTransaction,
  access: AccessData,
  actor: string,
  locationId: string,
  id: string,
): Promise<BillSplitDto> {
  const split = await tx.billSplit.findFirst({ where: { id, locationId } });
  assert(split, 404, 'Nota împărțită nu există.');
  const context: BillContext =
    split.scopeType === 'VISIT'
      ? { kind: 'VISIT', id: split.targetVisitId! }
      : { kind: 'ORDER', id: split.targetOrderId! };
  requireBillAccess(access, actor, locationId, context, split.total.toFixed(2));
  const sources = await tx.billSplitSource.findMany({
    where: { splitId: id },
    orderBy: { orderId: 'asc' },
  });
  const orders = await tx.order.findMany({
    where: { id: { in: sources.map((source) => source.orderId) }, locationId },
  });
  assert(orders.length === sources.length, 409, 'Sursele notei nu sunt disponibile.');
  for (const order of orders)
    requireBillOrderRead(access, actor, locationId, order.total.toFixed(2));
  const parts = await tx.billPart.findMany({
    where: { splitId: id },
    orderBy: { position: 'asc' },
  });
  const voided = await tx.billSplitVoid.findFirst({ where: { splitId: id, locationId } });
  const allocations = await readBillBalances(tx, access.org.id, locationId, id);
  const itemSources =
    split.mode === 'ITEMS'
      ? await tx.billSplitItem.findMany({
          where: { splitId: id, locationId },
          orderBy: { orderItemId: 'asc' },
        })
      : [];
  const originalItems = itemSources.length
    ? await readBillItemSources(
        tx,
        access.org.id,
        locationId,
        sources.map((source) => source.orderId),
      )
    : [];
  const itemAllocations =
    split.mode === 'ITEMS'
      ? await tx.billPartItem.findMany({
          where: { splitId: id, locationId },
          orderBy: { orderItemId: 'asc' },
        })
      : [];
  return {
    id,
    requestKey: split.requestKey,
    canVoid:
      !voided &&
      !(await tx.payment.findFirst({
        where: { orderId: { in: sources.map((source) => source.orderId) } },
        select: { id: true },
      })),
    status: voided ? 'VOIDED' : 'ACTIVE',
    voided: voided
      ? {
          id: voided.id,
          requestKey: voided.requestKey,
          actorUserId: voided.actorUserId,
          reason: voided.reason,
          createdAt: voided.createdAt.toISOString(),
        }
      : null,
    locationId,
    context,
    currency: 'MDL',
    total: split.total.toFixed(2),
    mode: split.mode === 'ITEMS' ? 'ITEMS' : split.mode === 'EQUAL' ? 'EQUAL' : 'CUSTOM',
    ...(split.mode === 'ITEMS'
      ? {
          sourceItems: itemSources.map((item) => ({
            ...originalItems.find((row) => row.orderItemId === item.orderItemId)!,
            orderId: item.orderId,
            orderItemId: item.orderItemId,
            quantity: item.quantity.toFixed(3),
            amount: item.amount.toFixed(2),
          })),
        }
      : {}),
    actorUserId: split.actorUserId,
    createdAt: split.createdAt.toISOString(),
    sources: sources.map((source) => ({
      orderId: source.orderId,
      number: orders.find((order) => order.id === source.orderId)!.number,
      version: source.orderVersion,
      amount: source.amount.toFixed(2),
    })),
    parts: parts.map((part) => ({
      ...(split.mode === 'ITEMS'
        ? {
            items: itemAllocations
              .filter((item) => item.partId === part.id)
              .map((item) => ({
                orderId: item.orderId,
                orderItemId: item.orderItemId,
                quantity: item.quantity.toFixed(3),
                amount: item.amount.toFixed(2),
              })),
          }
        : {}),
      id: part.id,
      position: part.position,
      amount: part.amount.toFixed(2),
      netPaidAmount: totalAmount(
        allocations.filter((row) => row.partId === part.id).map((row) => row.netPaidAmount),
      ),
      outstandingAmount: totalAmount(
        allocations.filter((row) => row.partId === part.id).map((row) => row.outstandingAmount),
      ),
      allocations: allocations
        .filter((row) => row.partId === part.id)
        .map(({ orderId, amount, netPaidAmount, outstandingAmount }) => ({
          orderId,
          amount,
          netPaidAmount,
          outstandingAmount,
        })),
    })),
  };
}
