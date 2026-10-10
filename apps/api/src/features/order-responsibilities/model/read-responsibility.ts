import type { TenantTransaction } from '@pos/db';
import type { AccessData } from '../../../entities/tenant-access';
import { assert } from '../../../shared/lib/http';
import {
  requireResponsibilityRead,
  canReadResponsibilityOrder,
  requireResponsibilityAction,
} from './responsibility-access';
import { responsibilityRow } from './responsibility-row';
export async function readResponsibilityOrder(
  tx: TenantTransaction,
  access: AccessData,
  actor: string,
  orderId: string,
  locationId: string,
) {
  requireResponsibilityRead(access, actor, locationId);
  const order = await tx.order.findFirst({ where: { id: orderId, locationId } });
  assert(order, 404, 'Comanda nu există.');
  assert(canReadResponsibilityOrder(access, actor, order));
  const p = await tx.orderResponsibility.findFirst({ where: { orderId } });
  if (p?.ownerUserId && p.ownerUserId !== actor) {
    const ownIncoming =
      p.state === 'PENDING_HANDOFF' &&
      (await tx.cashShift.findFirst({
        where: { locationId, ownerUserId: actor, registerId: p.registerId!, status: 'OPEN' },
      }));
    if (!ownIncoming)
      requireResponsibilityAction(access, actor, locationId, 'PREPARE_HANDOFF', p.ownerUserId);
  }
  return order;
}
export async function readResponsibility(
  tx: TenantTransaction,
  access: AccessData,
  actor: string,
  orderId: string,
  locationId: string,
) {
  const order = await readResponsibilityOrder(tx, access, actor, orderId, locationId);
  return responsibilityRow(tx, access, actor, order);
}
