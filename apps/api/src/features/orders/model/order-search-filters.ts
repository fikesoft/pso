import type { Prisma, TenantTransaction } from '@pos/db';
import { customerLookupHash, orderStatusFilter } from '../../../entities/order';
import type { OrderDateBoundary, ParsedOrderSearch } from './order-search.types';
import { orderFilterFingerprint } from './order-search-cursor';

export async function orderSearchFilters(
  tx: TenantTransaction,
  organizationId: string,
  query: ParsedOrderSearch,
  timezone: string,
) {
  const [dates] = await tx.$queryRaw<OrderDateBoundary[]>`
    SELECT (${query.createdFrom ?? null}::date::timestamp AT TIME ZONE ${timezone}) AS "from",
      ((${query.createdTo ?? null}::date + 1)::timestamp AT TIME ZONE ${timezone}) AS "until"`;
  const where: Prisma.OrderWhereInput = {
    organizationId,
    locationId: query.locationId,
    ...(query.number === undefined ? {} : { number: query.number }),
    ...(query.customerName === undefined
      ? {}
      : { customerNameLookupHash: customerLookupHash(organizationId, 'name', query.customerName) }),
    ...(query.customerPhone === undefined
      ? {}
      : {
          customerPhoneLookupHash: customerLookupHash(organizationId, 'phone', query.customerPhone),
        }),
    ...(query.createdByUserId ? { createdByUserId: query.createdByUserId } : {}),
    ...(query.status ? orderStatusFilter(query.status) : {}),
    ...(query.source ? { source: query.source === 'UNKNOWN' ? null : query.source } : {}),
    ...(dates?.from || dates?.until
      ? {
          createdAt: {
            ...(dates.from ? { gte: dates.from } : {}),
            ...(dates.until ? { lt: dates.until } : {}),
          },
        }
      : {}),
  };
  return { where, fingerprint: orderFilterFingerprint({ where, timezone }) };
}
