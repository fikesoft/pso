import type { TenantTransaction } from '@pos/db';
import type { AccessData } from '../../../entities/tenant-access';
import type { StoredVisit } from '../../../entities/table-visit';
import { visitResponse, visitMemberIds } from '../../../entities/table-visit';
import { effectiveKitchenStatus, effectiveOrderStatus } from '../../../entities/order';
import type { OrderKitchenStatus } from '@pos/contracts';
import { deriveVisitState } from './table-state';
import { canVisit, visitCloseBlocked } from './visit-access';
export async function visitState(tx: TenantTransaction, visit: StoredVisit) {
  const orders = await tx.order.findMany({
    where: {
      tableVisitId: {
        in: await visitMemberIds(tx, visit.organizationId, visit.locationId, visit.id),
      },
      locationId: visit.locationId,
    },
    select: { status: true, kitchenStatus: true },
  });
  return deriveVisitState(
    visitResponse(visit),
    orders.map((order) => ({
      status: effectiveOrderStatus(order.status, order.kitchenStatus),
      kitchenStatus: effectiveKitchenStatus(order.kitchenStatus) as OrderKitchenStatus,
    })),
  );
}
export async function visitDetail(
  tx: TenantTransaction,
  access: AccessData,
  actor: string,
  visit: StoredVisit,
) {
  const manage = visit.status === 'OPEN' && canVisit(access, actor, visit.locationId);
  const closeBlocked = await visitCloseBlocked(tx, access.org.id, visit.locationId, visit.id);
  const hasOrders = !!(await tx.order.findFirst({
    where: {
      tableVisitId: {
        in: await visitMemberIds(tx, visit.organizationId, visit.locationId, visit.id),
      },
      status: { not: 'CANCELLED' },
    },
    select: { id: true },
  }));
  return {
    visit: visitResponse(visit),
    ...(await visitState(tx, visit)),
    closeBlocked,
    actions: {
      changeGuests: manage,
      requestBill: manage && !visit.billRequested && hasOrders,
      cancelBill: manage && visit.billRequested,
      changeWaiter: visit.status === 'OPEN' && canVisit(access, actor, visit.locationId, true),
      close: manage && !closeBlocked,
    },
    timezone: access.locations.find((row) => row.id === visit.locationId)!.timezone,
  };
}
