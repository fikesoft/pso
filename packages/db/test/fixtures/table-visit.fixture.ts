import { randomUUID } from 'node:crypto';
import type { Prisma, TenantTransaction } from '../../src';
import { createOperationsFixture } from './operations.fixture';
import { createTable, tableData } from './dining-table.fixture';
export async function createVisitFixture() {
  const f = await createOperationsFixture();
  const table = await f.txA((tx) => createTable(tx, tableData(f)));
  async function record(
    tx: TenantTransaction,
    visitId: string,
    kind: string,
    changes: Partial<Prisma.TableVisitEventUncheckedCreateInput> = {},
  ) {
    const visit = await tx.tableVisit.findUniqueOrThrow({ where: { id: visitId } });
    const event = await tx.tableVisitEvent.create({
      data: {
        organizationId: f.a.organization.id,
        locationId: f.locationA.id,
        visitId,
        tableId: visit.tableId,
        requestKey: randomUUID(),
        requestHash: 'a'.repeat(64),
        kind,
        actorUserId: f.a.user.id,
        previousVersion: kind === 'OPEN' ? 0 : visit.version,
        resultVersion: kind === 'OPEN' ? 1 : visit.version + 1,
        ...(kind === 'CLOSE' ? { reason: 'Închidere sintetică' } : {}),
        ...changes,
      },
    });
    await tx.tableVisitCommand.create({
      data: {
        organizationId: event.organizationId,
        locationId: event.locationId,
        requestKey: event.requestKey,
        actorUserId: event.actorUserId,
        kind,
        status: 'SUCCEEDED',
        requestHash: event.requestHash,
        resultEventId: event.id,
        tableId: kind === 'OPEN' ? event.tableId : null,
        visitId: kind === 'OPEN' ? null : visitId,
        targetWaiterUserId: event.targetWaiterUserId,
        targetTableId: event.targetTableId,
      },
    });
    return event;
  }
  async function open(tx: TenantTransaction, tableId = table.id) {
    await tx.$executeRaw`SELECT public.prepare_dining_table(${f.a.organization.id}::uuid,${f.locationA.id}::uuid,${tableId}::uuid)`;
    const target = await tx.diningTable.findUniqueOrThrow({ where: { id: tableId } });
    const eventId = randomUUID();
    const visit = await tx.tableVisit.create({
      data: {
        organizationId: f.a.organization.id,
        locationId: f.locationA.id,
        tableId,
        tableCode: target.code,
        tableName: target.name,
        status: 'OPEN',
        version: 1,
        guestCount: 2,
        waiterUserId: f.a.user.id,
        waiterDisplayName: 'Sintetic',
        billRequested: false,
        lastEventId: eventId,
      },
    });
    await record(tx, visit.id, 'OPEN', { id: eventId });
    return tx.tableVisit.findUniqueOrThrow({ where: { id: visit.id } });
  }
  async function linked(tx: TenantTransaction, visitId: string) {
    const visit = await tx.tableVisit.findUniqueOrThrow({ where: { id: visitId } });
    const max = await tx.order.aggregate({
      _max: { number: true },
      where: { locationId: f.locationA.id },
    });
    const order = await tx.order.create({
      data: {
        organizationId: f.a.organization.id,
        locationId: f.locationA.id,
        number: (max._max.number ?? 0) + 1,
        serviceType: 'DINE_IN',
        tableVisitId: visitId,
        tableLabel: visit.tableCode,
        source: 'WAITER',
        total: '10.01',
        clientRequestId: randomUUID(),
        creationRequestHash: 'a'.repeat(64),
        createdByUserId: f.a.user.id,
        updatedByUserId: f.a.user.id,
      },
    });
    await tx.orderItem.create({
      data: {
        organizationId: order.organizationId,
        locationId: order.locationId,
        orderId: order.id,
        productId: f.catalogA.product.id,
        position: 0,
        productName: f.catalogA.product.name,
        productSku: f.catalogA.product.sku,
        unitPrice: '10.0050',
        quantity: '1.000',
        lineTotal: '10.01',
      },
    });
    return order;
  }
  return { ...f, table, open, record, linked };
}
