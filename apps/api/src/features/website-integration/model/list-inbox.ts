import type { TenantTransaction } from '@pos/db';
import { scopeFor } from '../../../entities/tenant-access';
import type { AccessData } from '../../../entities/tenant-access';
import { websiteInboxResponse } from '../../../entities/website-order';
import { assert } from '../../../shared/lib/http';
import type { WebsiteInboxQuery } from './inbox.types';

export async function listWebsiteInbox(
  tx: TenantTransaction,
  access: AccessData,
  userId: string,
  query: WebsiteInboxQuery,
) {
  const cursor = query.cursor
    ? await tx.websiteOrder.findFirst({ where: { id: query.cursor, locationId: query.locationId } })
    : null;
  assert(!query.cursor || cursor, 400, 'Cursorul nu este valid pentru locație');
  const status = query.status === 'AWAITING_ACCEPTANCE' ? 'PENDING' : query.status;
  const rows = await tx.websiteOrder.findMany({
    where: {
      locationId: query.locationId,
      status,
      ...(cursor
        ? {
            OR: [
              { createdAt: { lt: cursor.createdAt } },
              { createdAt: cursor.createdAt, id: { lt: cursor.id } },
            ],
          }
        : {}),
    },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    take: query.limit + 1,
  });
  const scanned = rows.slice(0, query.limit);
  const visible = scanned.filter((order) =>
    access.service.canUse(userId, 'orders.read', {
      ...scopeFor(access.org.id, { scopeType: 'LOCATION', locationId: order.locationId }),
      amount: order.total.toFixed(2),
    }),
  );
  return {
    orders: await Promise.all(visible.map((order) => websiteInboxResponse(tx, order))),
    nextCursor: rows.length > query.limit ? scanned.at(-1)!.id : null,
  };
}
