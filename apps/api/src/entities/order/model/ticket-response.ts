import type { TenantTransaction } from '@pos/db';
import type { ModifierGroupSnapshotDto } from '@pos/contracts';
import { resolveKitchenAlert } from '@pos/contracts';
import { assert } from '../../../shared/lib/http';
import type { StoredTicket } from './order.types';
import { effectiveKitchenStatus } from './order-status';
import { ticketAlertRules } from './ticket-alerts';

export async function ticketResponse(tx: TenantTransaction, ticket: StoredTicket) {
  const order = await tx.order.findUnique({ where: { id: ticket.orderId } });
  assert(order, 404, 'Comanda nu există');
  const visits = order.tableVisitId
    ? await tx.$queryRaw<Array<{ tableCode: string }>>`SELECT "tableCode" FROM "TableVisit"
        WHERE "organizationId"=${order.organizationId}::uuid AND "locationId"=${order.locationId}::uuid
        AND id=public.table_visit_root(${order.organizationId}::uuid,${order.locationId}::uuid,${order.tableVisitId}::uuid)`
    : [];
  const items = await tx.kitchenTicketItem.findMany({
    where: { ticketId: ticket.id },
    orderBy: { position: 'asc' },
  });
  const batches = await tx.kitchenTicketBatch.findMany({
    where: {
      organizationId: ticket.organizationId,
      locationId: ticket.locationId,
      ticketId: ticket.id,
    },
    orderBy: [{ courseNumber: 'asc' }, { id: 'asc' }],
  });
  const memberships = await tx.kitchenTicketBatchItem.findMany({
    where: {
      organizationId: ticket.organizationId,
      locationId: ticket.locationId,
      ticketId: ticket.id,
    },
    orderBy: { ticketItemId: 'asc' },
  });
  const rules = await ticketAlertRules(
    tx,
    ticket.organizationId,
    ticket.locationId,
    items.map((item) => item.productId),
    items.flatMap((item) => (item.categoryId ? [item.categoryId] : [])),
    batches.flatMap((batch) => (batch.stationId ? [batch.stationId] : [])),
  );
  const stations = new Map(batches.map((batch) => [batch.id, batch.stationId]));
  const itemStations = new Map(
    memberships.map((member) => [member.ticketItemId, stations.get(member.batchId) ?? null]),
  );
  return {
    batches: batches.map((batch) => ({
      id: batch.id,
      status: batch.status,
      version: batch.version,
      courseNumber: batch.courseNumber,
      firedAt: batch.firedAt,
      createdAt: batch.createdAt,
      updatedAt: batch.updatedAt,
      station: batch.stationId
        ? { id: batch.stationId, code: batch.stationCode!, name: batch.stationName! }
        : null,
      ticketItemIds: memberships
        .filter((item) => item.batchId === batch.id)
        .map((item) => item.ticketItemId),
    })),
    id: ticket.id,
    locationId: ticket.locationId,
    orderId: ticket.orderId,
    orderNumber: order.number,
    orderVersion: ticket.orderVersion,
    revision: ticket.revision,
    serviceType: order.serviceType,
    tableLabel: visits[0]?.tableCode ?? order.tableLabel,
    status: effectiveKitchenStatus(ticket.status),
    version: ticket.version,
    createdAt: ticket.createdAt,
    updatedAt: ticket.updatedAt,
    items: items.map((item) => ({
      id: item.id,
      alertThresholds: resolveKitchenAlert(rules, {
        locationId: ticket.locationId,
        productId: item.productId,
        categoryId: item.categoryId,
        stationId: itemStations.get(item.id) ?? null,
      }).thresholds,
      orderItemId: item.orderItemId,
      position: item.position,
      courseNumber: item.courseNumber,
      productName: item.productName,
      productSku: item.productSku,
      quantity: item.quantity.toFixed(3),
      note: item.note,
      modifierGroups: Array.isArray(item.modifierSnapshot)
        ? (item.modifierSnapshot as unknown as ModifierGroupSnapshotDto[])
        : [],
    })),
  };
}
