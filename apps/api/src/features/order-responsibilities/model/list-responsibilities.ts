import type { TenantTransaction } from '@pos/db';
import type { OrderResponsibilityRowDto } from '@pos/contracts/order-responsibilities';
import type { AccessData } from '../../../entities/tenant-access';
import { assert } from '../../../shared/lib/http';
import {
  RESPONSIBILITY_SCAN_BATCH,
  RESPONSIBILITY_SCAN_BUDGET,
} from '../config/responsibility.constants';
import {
  canReadResponsibilityOrder,
  requireResponsibilityAction,
  requireResponsibilityRead,
} from './responsibility-access';
import { readResponsibilityCursor, responsibilityCursor } from './responsibility-cursor';
import { responsibilityCandidates } from './responsibility-query';
import { responsibilityRow } from './responsibility-row';
import type { ResponsibilityCursorContext, ResponsibilityShift } from './responsibility.types';
export async function listResponsibilities(
  tx: TenantTransaction,
  access: AccessData,
  c: ResponsibilityCursorContext,
) {
  const q = c.query;
  requireResponsibilityRead(access, c.actor, q.locationId);
  let shift: ResponsibilityShift | undefined;
  if ('shiftId' in q) {
    shift =
      (await tx.cashShift.findFirst({ where: { id: q.shiftId, locationId: q.locationId } })) ??
      undefined;
    assert(shift, 404, 'Tura nu există.');
    if (shift.ownerUserId !== c.actor)
      requireResponsibilityAction(
        access,
        c.actor,
        q.locationId,
        q.view === 'ASSIGNED' ? 'PREPARE_HANDOFF' : 'ASSIGN',
        shift.ownerUserId,
      );
    if (q.view === 'PENDING' && q.perspective === 'INCOMING')
      assert(shift.status === 'OPEN', 409, 'Tura nu mai este deschisă.');
  }
  let before = q.cursor ? readResponsibilityCursor(c, q.cursor) : undefined;
  const orders: OrderResponsibilityRowDto[] = [];
  let scanned = 0;
  while (scanned < RESPONSIBILITY_SCAN_BUDGET) {
    const take = Math.min(RESPONSIBILITY_SCAN_BATCH, RESPONSIBILITY_SCAN_BUDGET - scanned);
    const rows = await tx.$queryRaw<{ id: string; number: number }[]>(
      responsibilityCandidates(c, take + 1, before, shift),
    );
    const stored = await tx.order.findMany({
      where: { id: { in: rows.slice(0, take).map((r) => r.id) } },
    });
    const byId = new Map(stored.map((order) => [order.id, order]));
    for (const [index, candidate] of rows.slice(0, take).entries()) {
      before = candidate.number;
      scanned += 1;
      const order = byId.get(candidate.id);
      if (order && canReadResponsibilityOrder(access, c.actor, order))
        orders.push(await responsibilityRow(tx, access, c.actor, order));
      if (orders.length === q.limit || scanned === RESPONSIBILITY_SCAN_BUDGET)
        return {
          orders,
          nextCursor: index < rows.length - 1 ? responsibilityCursor(c, before) : null,
          timezone: c.timezone,
        };
    }
    if (rows.length <= take) break;
  }
  return { orders, nextCursor: null, timezone: c.timezone };
}
