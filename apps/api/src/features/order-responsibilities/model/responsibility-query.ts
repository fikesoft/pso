import { Prisma } from '@pos/db';
import type { ResponsibilityCursorContext, ResponsibilityShift } from './responsibility.types';
export function responsibilityCandidates(
  c: ResponsibilityCursorContext,
  take: number,
  before?: number,
  shift?: ResponsibilityShift,
) {
  const q = c.query;
  const projection =
    q.view === 'UNASSIGNED'
      ? Prisma.sql`(p."orderId" IS NULL OR p.state='UNASSIGNED')`
      : q.view === 'ASSIGNED'
        ? Prisma.sql`p.state='ASSIGNED' AND p."shiftId"=${q.shiftId}::uuid`
        : q.perspective === 'OUTGOING'
          ? Prisma.sql`p.state='PENDING_HANDOFF' AND p."shiftId"=${q.shiftId}::uuid`
          : Prisma.sql`p.state='PENDING_HANDOFF' AND p."registerId"=${shift!.registerId}::uuid AND p."shiftId"<>${shift!.id}::uuid AND EXISTS (SELECT 1 FROM "CashShift" s WHERE s."organizationId"=o."organizationId" AND s.id=p."shiftId" AND s.status='CLOSED')`;
  return Prisma.sql`SELECT o.id,o.number FROM "Order" o LEFT JOIN "OrderResponsibility" p ON p."organizationId"=o."organizationId" AND p."locationId"=o."locationId" AND p."orderId"=o.id
    WHERE o."organizationId"=${c.organizationId}::uuid AND o."locationId"=${q.locationId}::uuid
    AND o.status NOT IN ('DRAFT','CANCELLED') AND o.total-public.order_net_paid(o."organizationId",o.id)>0
    AND NOT EXISTS (SELECT 1 FROM "Checkout" checkout WHERE checkout."organizationId"=o."organizationId" AND checkout."orderId"=o.id AND checkout.mode='DEMO')
    AND (${projection}) ${before === undefined ? Prisma.empty : Prisma.sql`AND o.number<${before}`}
    ORDER BY o.number DESC LIMIT ${take}`;
}
