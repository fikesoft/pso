import type { TenantTransaction } from '@pos/db';
import { orderResponse } from '../../../entities/order';
import type { AccessData } from '../../../entities/tenant-access';
import { ORDER_SCAN_BATCH, ORDER_SCAN_BUDGET } from '../config/order-search.constants';
import { canReadOrder } from './order-authorization';
import { encodeActiveOrderCursor } from './order-active-cursor';
import { activeOrderCandidatesSql } from './order-active-sql';
import type {
  ActiveOrderCandidate,
  ActiveOrderContext,
  ActiveOrderRow,
} from './order-active.types';

/** Caller uses the endpoint's read-only RR snapshot for membership, authorization and hydration. */
export async function activeOrderPage(
  tx: TenantTransaction,
  access: AccessData,
  context: ActiveOrderContext,
  limit: number,
  before?: number,
) {
  const orders: ActiveOrderRow[] = [];
  let scanned = 0;
  while (scanned < ORDER_SCAN_BUDGET) {
    const take = Math.min(ORDER_SCAN_BATCH, ORDER_SCAN_BUDGET - scanned);
    const rows = await tx.$queryRaw<ActiveOrderCandidate[]>(
      activeOrderCandidatesSql(context, take + 1, before),
    );
    const stored = await tx.order.findMany({
      where: { id: { in: rows.slice(0, take).map((r) => r.id) } },
    });
    const byId = new Map(stored.map((order) => [order.id, order]));
    for (const [index, candidate] of rows.slice(0, take).entries()) {
      before = candidate.number;
      scanned += 1;
      const order = byId.get(candidate.id);
      if (order && canReadOrder(access, context.userId, order)) {
        orders.push({
          ...(await orderResponse(tx, order, true)),
          activeReasons: candidate.activeReasons,
        });
      }
      if (orders.length === limit || scanned === ORDER_SCAN_BUDGET) {
        return {
          orders,
          nextCursor: index < rows.length - 1 ? encodeActiveOrderCursor(context, before) : null,
        };
      }
    }
    if (rows.length <= take) return { orders, nextCursor: null };
  }
  return { orders, nextCursor: null };
}
