import { z } from 'zod';
import type { CustomerHistoryQuery } from '@pos/contracts';
import type { TenantTransaction } from '@pos/db';
import { orderResponse, orderStatusFilter } from '../../../entities/order';
import type { StoredOrder } from '../../../entities/order';
import { scopeFor } from '../../../entities/tenant-access';
import type { AccessData } from '../../../entities/tenant-access';
import { openJson, sealJson } from '../../../shared/lib/sealed-json';
import { assert, HttpError } from '../../../shared/lib/http';
import {
  CUSTOMER_HISTORY_CURSOR_DOMAIN,
  CUSTOMER_HISTORY_SCAN_BATCH,
  CUSTOMER_HISTORY_SCAN_BUDGET,
} from '../config/customer-history.constants';
import { requireCustomerManagement } from './customer-management';

const anchorSchema = z.object({ number: z.number().int().positive() }).strict();

export async function readCustomerHistory(
  tx: TenantTransaction,
  access: AccessData,
  actorUserId: string,
  customerId: string,
  query: CustomerHistoryQuery,
) {
  requireCustomerManagement(access, actorUserId, query.locationId);
  const scope = scopeFor(access.org.id, { scopeType: 'LOCATION', locationId: query.locationId });
  assert(access.service.canUse(actorUserId, 'orders.read', scope));
  assert(
    await tx.customer.findFirst({ where: { id: customerId, organizationId: access.org.id } }),
    404,
    'Clientul nu există.',
  );
  const associated = [access.org.id, actorUserId, customerId, query.locationId, query.status ?? ''];
  let before: number | undefined;
  if (query.cursor) {
    try {
      before = anchorSchema.parse(
        openJson(CUSTOMER_HISTORY_CURSOR_DOMAIN, associated, query.cursor),
      ).number;
    } catch {
      throw new HttpError(400, 'Cursorul istoricului nu este valid pentru acest context.');
    }
  }
  const orders: StoredOrder[] = [];
  let scanned = 0;
  let nextCursor: string | null = null;
  while (scanned < CUSTOMER_HISTORY_SCAN_BUDGET) {
    const take = Math.min(CUSTOMER_HISTORY_SCAN_BATCH, CUSTOMER_HISTORY_SCAN_BUDGET - scanned);
    const rows = await tx.order.findMany({
      where: {
        organizationId: access.org.id,
        locationId: query.locationId,
        customerId,
        ...(query.status ? orderStatusFilter(query.status) : {}),
        ...(before === undefined ? {} : { number: { lt: before } }),
      },
      orderBy: { number: 'desc' },
      take: take + 1,
    });
    for (const [index, order] of rows.slice(0, take).entries()) {
      before = order.number;
      scanned++;
      if (
        access.service.canUse(actorUserId, 'orders.read', {
          ...scope,
          amount: order.total.toString(),
        })
      )
        orders.push(order);
      if (orders.length === query.limit || scanned === CUSTOMER_HISTORY_SCAN_BUDGET) {
        if (index < rows.length - 1)
          nextCursor = sealJson(CUSTOMER_HISTORY_CURSOR_DOMAIN, associated, { number: before });
        break;
      }
    }
    if (
      orders.length === query.limit ||
      scanned === CUSTOMER_HISTORY_SCAN_BUDGET ||
      rows.length <= take
    )
      break;
  }
  return {
    customerId,
    locationId: query.locationId,
    orders: await Promise.all(orders.map((order) => orderResponse(tx, order, true))),
    nextCursor,
  };
}
