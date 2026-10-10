import type { PaymentSummary } from '@pos/contracts';
import type { TenantTransaction } from '@pos/db';

export async function paymentSummary(
  tx: TenantTransaction,
  orderId: string,
): Promise<PaymentSummary> {
  const [summary] = await tx.$queryRaw<PaymentSummary[]>`
    SELECT public.payment_state(o.total,c.amount,r.amount) AS status,
      c.amount::text AS "collectedAmount", r.amount::text AS "refundedAmount",
      (c.amount-r.amount)::text AS "netPaidAmount",
      (CASE WHEN o.status='CANCELLED' OR EXISTS (SELECT 1 FROM public."Checkout" d
        WHERE d."organizationId"=o."organizationId" AND d."orderId"=o.id AND d.mode='DEMO')
        THEN 0.00 ELSE o.total-c.amount+r.amount END)::text AS "outstandingAmount"
    FROM public."Order" o
    CROSS JOIN LATERAL (SELECT coalesce(sum(p.amount),0.00) AS amount FROM public."Payment" p
      WHERE p."organizationId"=o."organizationId" AND p."orderId"=o.id) c
    CROSS JOIN LATERAL (SELECT coalesce(sum(f.amount),0.00) AS amount FROM public."PaymentRefund" f
      WHERE f."organizationId"=o."organizationId" AND f."orderId"=o.id) r
    WHERE o.id=${orderId}::uuid`;
  if (!summary) throw new Error('Comanda lipsește din contextul financiar.');
  return summary;
}
