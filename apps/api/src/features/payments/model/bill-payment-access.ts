import type { TenantTransaction } from '@pos/db';
import type { BillPaymentPreview } from '@pos/contracts';
import type { AccessData } from '../../../entities/tenant-access';
import { scopeFor } from '../../../entities/tenant-access';
import { readBillBalances } from '../../../entities/bill-split';
import { assert } from '../../../shared/lib/http';
import { totalAmount } from '../../../shared/lib/money';
import { requirePaymentAccess } from './payment-access';
export function requireBillCollectionAmount(
  access: AccessData,
  actor: string,
  locationId: string,
  amount?: string,
) {
  assert(
    access.service.canUse(actor, 'payments.collect', {
      ...scopeFor(access.org.id, { scopeType: 'LOCATION', locationId }),
      ...(amount ? { amount } : {}),
    }),
  );
}
export async function billPaymentPreview(
  tx: TenantTransaction,
  access: AccessData,
  actor: string,
  locationId: string,
  partId: string,
  allowVoided = false,
): Promise<BillPaymentPreview> {
  requireBillCollectionAmount(access, actor, locationId);
  const part = await tx.billPart.findFirst({ where: { id: partId, locationId } });
  assert(part, 404, 'Partea notei nu există.');
  if (!allowVoided)
    assert(
      !(await tx.billSplitVoid.findFirst({ where: { splitId: part.splitId, locationId } })),
      409,
      'Împărțirea notei a fost anulată.',
    );
  const allocations = (await readBillBalances(tx, access.org.id, locationId, part.splitId)).filter(
    (row) => row.partId === partId,
  );
  const orders = await tx.order.findMany({
    where: { id: { in: allocations.map((row) => row.orderId) }, locationId },
    orderBy: { id: 'asc' },
  });
  assert(orders.length === allocations.length, 409, 'Sursele părții nu sunt disponibile.');
  for (const order of orders)
    requirePaymentAccess(access, actor, locationId, order.total.toFixed(2));
  const outstandingAmount = totalAmount(allocations.map((row) => row.outstandingAmount));
  requireBillCollectionAmount(access, actor, locationId, outstandingAmount);
  return {
    partId,
    locationId,
    outstandingAmount,
    sources: orders.map((order) => ({
      orderId: order.id,
      version: order.version,
      outstandingAmount: allocations.find((row) => row.orderId === order.id)!.outstandingAmount,
    })),
  };
}
