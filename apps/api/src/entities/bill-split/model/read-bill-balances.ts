import type { TenantTransaction } from '@pos/db';
import type { BillAllocationBalance } from './bill-balance.types';

/** Read in the caller's tenant transaction and consistent financial snapshot. */
export async function readBillBalances(
  tx: TenantTransaction,
  organizationId: string,
  locationId: string,
  splitId: string,
): Promise<BillAllocationBalance[]> {
  return tx.$queryRaw<BillAllocationBalance[]>`
    SELECT a."partId", a."orderId", a.amount::numeric(18,2)::text AS amount,
      n.paid::numeric(18,2)::text AS "netPaidAmount",
      (a.amount-n.paid)::numeric(18,2)::text AS "outstandingAmount"
    FROM public."BillPartAllocation" a
    CROSS JOIN LATERAL (
      SELECT public.bill_part_order_net(a."organizationId",a."partId",a."orderId") AS paid
    ) n
    WHERE a."organizationId"=${organizationId}::uuid
      AND a."locationId"=${locationId}::uuid AND a."splitId"=${splitId}::uuid
    ORDER BY a."partId", a."orderId"
  `;
}
