import { Prisma } from '@pos/db';
import type { ActiveOrderContext } from './order-active.types';

/** The alias s is a scoped projection of the order and its separate payment/refund aggregates. */
export function activeOrderReasonsSql() {
  return Prisma.sql`array_remove(ARRAY[
    CASE WHEN s.status IN ('DRAFT','OPEN','CONFIRMED','IN_PROGRESS','READY')
      THEN 'OPERATIONAL' END,
    CASE WHEN s.status IN ('OPEN','CONFIRMED','IN_PROGRESS','READY','COMPLETED')
      AND NOT s.demo AND s.total-s.collected+s.refunded>0 AND s.refunded=0
      THEN 'PAYMENT_OUTSTANDING' END,
    CASE WHEN (s.status IN ('OPEN','CONFIRMED','IN_PROGRESS','READY','COMPLETED')
      AND NOT s.demo AND s.total-s.collected+s.refunded>0 AND s.refunded>0)
      OR (s.status='CANCELLED' AND s.collected-s.refunded>0)
      THEN 'FINANCIAL_REVIEW' END,
    CASE WHEN s.status IN ('OPEN','CONFIRMED','IN_PROGRESS','READY','COMPLETED')
      AND s."serviceType"='DELIVERY'
      AND s."deliveryStatus" IN ('WAITING_COURIER','ASSIGNED','PICKED_UP','DELIVERING','FAILED')
      THEN 'DELIVERY_PENDING' END,
    CASE WHEN s.status IN ('OPEN','CONFIRMED','IN_PROGRESS','READY','COMPLETED')
      AND s."serviceType"='DELIVERY' AND s."deliveryStatus" IS NULL
      THEN 'DELIVERY_UNKNOWN' END
  ]::text[],NULL)`;
}

export function activeOrderCandidatesSql(
  context: ActiveOrderContext,
  take: number,
  before?: number,
) {
  return Prisma.sql`
    WITH scoped AS (
      SELECT o.id,o.number,o.status,o."serviceType",o."deliveryStatus",o.total,
        p.collected,r.refunded,
        EXISTS(SELECT 1 FROM public."Checkout" d WHERE d."organizationId"=o."organizationId"
          AND d."orderId"=o.id AND d.mode='DEMO') AS demo
      FROM public."Order" o
      CROSS JOIN LATERAL (SELECT coalesce(sum(p.amount),0.00::numeric) AS collected
        FROM public."Payment" p WHERE p."organizationId"=o."organizationId" AND p."orderId"=o.id) p
      CROSS JOIN LATERAL (SELECT coalesce(sum(r.amount),0.00::numeric) AS refunded
        FROM public."PaymentRefund" r WHERE r."organizationId"=o."organizationId" AND r."orderId"=o.id) r
      WHERE o."organizationId"=${context.organizationId}::uuid
        AND o."locationId"=${context.locationId}::uuid
        ${before === undefined ? Prisma.empty : Prisma.sql`AND o.number<${before}`}
    ), classified AS (
      SELECT s.id,s.number,${activeOrderReasonsSql()} AS "activeReasons" FROM scoped s
    )
    SELECT * FROM classified WHERE cardinality("activeReasons")>0
    ORDER BY number DESC LIMIT ${take}`;
}
