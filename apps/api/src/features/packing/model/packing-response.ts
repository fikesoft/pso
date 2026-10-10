import type { TenantTransaction } from '@pos/db';
import type {
  KitchenStatus,
  ModifierGroupSnapshotDto,
  PackingSessionDto,
  ServiceType,
} from '@pos/contracts';
import { effectiveKitchenStatus, effectiveOrderStatus } from '../../../entities/order';
import { assert } from '../../../shared/lib/http';
import type { StoredPackingSession } from './packing.types';

export async function packingResponse(
  tx: TenantTransaction,
  session: StoredPackingSession,
): Promise<PackingSessionDto> {
  const scope = { organizationId: session.organizationId, locationId: session.locationId };
  const order = await tx.order.findFirst({
    where: { ...scope, id: session.orderId },
    select: {
      id: true,
      number: true,
      status: true,
      kitchenStatus: true,
      serviceType: true,
      tableLabel: true,
      tableVisitId: true,
    },
  });
  assert(order, 404, 'Comanda nu există.');
  const ticket = await tx.kitchenTicket.findFirst({
    where: { ...scope, id: session.ticketId, orderId: session.orderId },
    select: { status: true },
  });
  assert(ticket, 404, 'Tichetul nu există.');
  const visits = order.tableVisitId
    ? await tx.$queryRaw<Array<{ tableCode: string }>>`SELECT "tableCode" FROM "TableVisit"
        WHERE "organizationId"=${session.organizationId}::uuid AND "locationId"=${session.locationId}::uuid
        AND id=public.table_visit_root(${session.organizationId}::uuid,${session.locationId}::uuid,${order.tableVisitId}::uuid)`
    : [];
  const [items, snapshots] = await Promise.all([
    tx.packingItem.findMany({ where: { ...scope, sessionId: session.id } }),
    tx.kitchenTicketItem.findMany({
      where: { ...scope, ticketId: session.ticketId },
      orderBy: { position: 'asc' },
    }),
  ]);
  const memberships = new Map(items.map((item) => [item.ticketItemId, item]));
  return {
    id: session.id,
    locationId: session.locationId,
    orderId: order.id,
    ticketId: session.ticketId,
    orderNumber: order.number,
    orderStatus: effectiveOrderStatus(order.status, order.kitchenStatus),
    kitchenStatus: effectiveKitchenStatus(ticket.status) as KitchenStatus,
    serviceType: order.serviceType as ServiceType,
    tableLabel: visits[0]?.tableCode ?? order.tableLabel,
    status: session.status as PackingSessionDto['status'],
    version: session.version,
    createdAt: session.createdAt.toISOString(),
    startedAt: session.startedAt?.toISOString() ?? null,
    completedAt: session.completedAt?.toISOString() ?? null,
    items: snapshots.map((snapshot) => {
      const item = memberships.get(snapshot.id);
      assert(item, 409, 'Checklistul comenzii este incomplet.');
      const groups = snapshot.modifierSnapshot as unknown as ModifierGroupSnapshotDto[];
      return {
        id: item.id,
        orderItemId: snapshot.orderItemId,
        position: snapshot.position,
        productName: snapshot.productName,
        quantity: snapshot.quantity.toFixed(3),
        note: snapshot.note,
        modifierGroups: groups.map((group) => ({
          groupName: group.groupName,
          options: group.options.map((option) => option.optionName),
        })),
        checked: item.checked,
        checkedAt: item.checkedAt?.toISOString() ?? null,
      };
    }),
  };
}
