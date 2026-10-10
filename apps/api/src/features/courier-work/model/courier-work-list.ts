import { z } from 'zod';
import type { TenantTransaction } from '@pos/db';
import type { CourierWorkQuery } from '@pos/contracts';
import {
  COURIER_WORK_ACTIVE_STATUSES,
  COURIER_WORK_HISTORY_STATUSES,
  COURIER_WORK_LIMITS,
  courierWorkListResponseSchema,
} from '@pos/contracts';
import type { AccessData } from '../../../entities/tenant-access';
import type { StoredOrder } from '../../../entities/order';
import { openJson, sealJson } from '../../../shared/lib/sealed-json';
import { HttpError } from '../../../shared/lib/http';
import { COURIER_WORK_CURSOR_DOMAIN } from '../config/courier-work.constants';
import { canReadCourierWork, requireCourierWork } from './courier-work-access';
import { courierWorkView } from './courier-work-view';
const cursorSchema = z.object({ number: z.number().int().positive() }).strict();
export async function courierWorkList(
  tx: TenantTransaction,
  access: AccessData,
  actor: string,
  query: CourierWorkQuery,
) {
  await requireCourierWork(tx, access, actor, query.locationId);
  const context = [access.org.id, actor, query.locationId, query.view];
  let before: number | undefined;
  if (query.cursor) {
    try {
      before = cursorSchema.parse(
        openJson(COURIER_WORK_CURSOR_DOMAIN, context, query.cursor),
      ).number;
    } catch {
      throw new HttpError(400, 'Cursorul livrărilor nu este valid pentru acest context.');
    }
  }
  const orders: StoredOrder[] = [];
  let scanned = 0,
    nextCursor: string | null = null;
  while (scanned < COURIER_WORK_LIMITS.scanBudget) {
    const take = Math.min(COURIER_WORK_LIMITS.scanBatch, COURIER_WORK_LIMITS.scanBudget - scanned);
    const rows = await tx.order.findMany({
      where: {
        organizationId: access.org.id,
        locationId: query.locationId,
        serviceType: 'DELIVERY',
        deliveryCourierId: actor,
        deliveryStatus: {
          in: [
            ...(query.view === 'ACTIVE'
              ? COURIER_WORK_ACTIVE_STATUSES
              : COURIER_WORK_HISTORY_STATUSES),
          ],
        },
        ...(before === undefined ? {} : { number: { lt: before } }),
      },
      orderBy: { number: 'desc' },
      take: take + 1,
    });
    for (const [index, order] of rows.slice(0, take).entries()) {
      before = order.number;
      scanned++;
      if (canReadCourierWork(access, actor, query.locationId, order.total.toFixed(2)))
        orders.push(order);
      if (orders.length === query.limit || scanned === COURIER_WORK_LIMITS.scanBudget) {
        if (index < rows.length - 1)
          nextCursor = sealJson(COURIER_WORK_CURSOR_DOMAIN, context, { number: before });
        break;
      }
    }
    if (
      orders.length === query.limit ||
      scanned === COURIER_WORK_LIMITS.scanBudget ||
      rows.length <= take
    )
      break;
  }
  return courierWorkListResponseSchema.parse({
    locationId: query.locationId,
    courierUserId: actor,
    view: query.view,
    orders: await Promise.all(orders.map((order) => courierWorkView(tx, order))),
    nextCursor,
  });
}
