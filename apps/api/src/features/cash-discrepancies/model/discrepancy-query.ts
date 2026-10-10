import { Prisma } from '@pos/db';
import type { DiscrepancyContext } from './discrepancy.types';
export function discrepancyFilter(c: DiscrepancyContext) {
  return Prisma.sql`c."organizationId"=${c.organizationId}::uuid AND c."locationId"=${c.locationId}::uuid
    AND c."closedAt">=(${c.closedFrom}::date::timestamp AT TIME ZONE ${c.timezone})
    AND c."closedAt"<((${c.closedTo}::date+1)::timestamp AT TIME ZONE ${c.timezone})
    ${c.discrepancy === 'NONZERO' ? Prisma.sql`AND c.difference<>0` : Prisma.empty}
    ${c.registerId ? Prisma.sql`AND s."registerId"=${c.registerId}::uuid` : Prisma.empty}`;
}
