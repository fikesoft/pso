import type { TenantTransaction } from '@pos/db';
import type { StoredOrder } from '../../../entities/order';
import type { AccessData } from '../../../entities/tenant-access';
import { ORDER_SCAN_BATCH, ORDER_SCAN_BUDGET } from '../config/order-search.constants';
import { canReadOrder } from './order-authorization';
import { encodeOrderCursor } from './order-search-cursor';
import type { OrderScanInput } from './order-search.types';

/** The cursor advances past scanned candidates, including rows hidden by current permissions. */
export async function scanReadableOrders(
  tx: TenantTransaction,
  access: AccessData,
  input: OrderScanInput,
) {
  const orders: StoredOrder[] = [];
  const seen = new Set<string>();
  let before = input.before;
  let scanned = 0;
  while (scanned < ORDER_SCAN_BUDGET) {
    const take = Math.min(ORDER_SCAN_BATCH, ORDER_SCAN_BUDGET - scanned);
    const rows = await tx.order.findMany({
      where: { AND: [input.where, ...(before === undefined ? [] : [{ number: { lt: before } }])] },
      orderBy: { number: 'desc' },
      take: take + 1,
    });
    for (const [index, order] of rows.slice(0, take).entries()) {
      before = order.number;
      scanned += 1;
      const identity = input.distinctCreators ? order.createdByUserId : order.id;
      if (!seen.has(identity) && canReadOrder(access, input.context.userId, order)) {
        orders.push(order);
        seen.add(identity);
      }
      if (orders.length === input.limit || scanned === ORDER_SCAN_BUDGET) {
        return {
          orders,
          nextCursor: index < rows.length - 1 ? encodeOrderCursor(input.context, before) : null,
        };
      }
    }
    if (rows.length <= take) return { orders, nextCursor: null };
  }
  return { orders, nextCursor: null };
}
