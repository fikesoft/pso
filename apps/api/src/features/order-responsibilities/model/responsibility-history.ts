import type { TenantTransaction, Prisma } from '@pos/db';
import type { OrderResponsibilityEventDto } from '@pos/contracts/order-responsibilities';
import type { AccessData } from '../../../entities/tenant-access';
import { responsibilityEventResponse } from '../../../entities/order-responsibility';
import {
  RESPONSIBILITY_SCAN_BATCH,
  RESPONSIBILITY_SCAN_BUDGET,
} from '../config/responsibility.constants';
import { readResponsibilityOrder } from './read-responsibility';
import { responsibilityScope } from './responsibility-access';
import {
  readResponsibilityHistoryCursor,
  responsibilityHistoryCursor,
} from './responsibility-cursor';
import type { ResponsibilityHistoryContext } from './responsibility.types';
export async function responsibilityHistory(
  tx: TenantTransaction,
  access: AccessData,
  c: ResponsibilityHistoryContext,
  cursor?: string,
) {
  await readResponsibilityOrder(tx, access, c.actor, c.orderId, c.locationId);
  let before = cursor ? readResponsibilityHistoryCursor(c, cursor) : undefined;
  const events: OrderResponsibilityEventDto[] = [];
  let scanned = 0;
  while (scanned < RESPONSIBILITY_SCAN_BUDGET) {
    const take = Math.min(RESPONSIBILITY_SCAN_BATCH, RESPONSIBILITY_SCAN_BUDGET - scanned);
    const where: Prisma.OrderResponsibilityEventWhereInput = {
      orderId: c.orderId,
      locationId: c.locationId,
    };
    if (before)
      where.OR = [
        { createdAt: { lt: new Date(before.createdAt) } },
        { createdAt: new Date(before.createdAt), id: { lt: before.id } },
      ];
    const rows = await tx.orderResponsibilityEvent.findMany({
      where,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: take + 1,
    });
    for (const [index, row] of rows.slice(0, take).entries()) {
      scanned += 1;
      before = { id: row.id, createdAt: row.createdAt.toISOString() };
      if (
        access.service.canUse(c.actor, 'orders.read', {
          ...responsibilityScope(access, c.locationId),
          amount: row.orderTotal.toFixed(2),
        })
      )
        events.push(await responsibilityEventResponse(tx, row));
      if (events.length === c.limit || scanned === RESPONSIBILITY_SCAN_BUDGET)
        return {
          events,
          nextCursor: index < rows.length - 1 ? responsibilityHistoryCursor(c, row) : null,
          timezone: c.timezone,
        };
    }
    if (rows.length <= take) break;
  }
  return { events, nextCursor: null, timezone: c.timezone };
}
