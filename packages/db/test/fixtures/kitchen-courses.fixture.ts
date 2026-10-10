import { randomUUID } from 'node:crypto';
import { reserveOrder } from '../../../../apps/api/src/entities/inventory';
import { createOperationsFixture } from './operations.fixture';
import { createStation, stationData } from './kitchen-station.fixture';

export async function createKitchenCoursesFixture(assigned = true) {
  const f = await createOperationsFixture();
  const draft = await f.createDraft();
  const ticket = await f
    .txA(async (tx) => {
      if (assigned) {
        const station = await createStation(tx, stationData(f));
        await tx.kitchenRoutingCommand.create({
          data: {
            organizationId: f.a.organization.id,
            locationId: f.locationA.id,
            productId: f.catalogA.product.id,
            actorUserId: f.a.user.id,
            requestKey: randomUUID(),
            status: 'SUCCEEDED',
            requestHash: 'a'.repeat(64),
            expectedVersion: 0,
            resultVersion: 1,
            stationId: station.id,
          },
        });
      }
      const unassigned = await tx.product.create({
        data: {
          organizationId: f.a.organization.id,
          categoryId: f.catalogA.category.id,
          name: 'Produs sintetic fără stație',
          sku: 'COURSE-UNASSIGNED',
          createdByUserId: f.a.user.id,
        },
      });
      await tx.locationProduct.create({
        data: {
          organizationId: f.a.organization.id,
          locationId: f.locationA.id,
          productId: unassigned.id,
          price: '10.0050',
        },
      });
      for (let position = 1; position < 8; position++) {
        const product = position < 4 ? f.catalogA.product : unassigned;
        await tx.orderItem.create({
          data: {
            organizationId: f.a.organization.id,
            locationId: f.locationA.id,
            orderId: draft.order.id,
            productId: product.id,
            position,
            courseNumber: position % 4,
            productName: product.name,
            productSku: product.sku,
            unitPrice: '10.0050',
            quantity: '1',
            lineTotal: '10.01',
          },
        });
      }
      await tx.order.update({
        where: { id: draft.order.id },
        data: { total: '80.08', version: 2 },
      });
      const items = await tx.orderItem.findMany({ where: { orderId: draft.order.id } });
      const ticket = await tx.kitchenTicket.create({
        data: {
          organizationId: f.a.organization.id,
          locationId: f.locationA.id,
          orderId: draft.order.id,
          orderVersion: 3,
          requestKey: randomUUID(),
          requestHash: 'b'.repeat(64),
          sentByUserId: f.a.user.id,
        },
      });
      await tx.kitchenTicketItem.createMany({
        data: items.map((item) => ({
          organizationId: f.a.organization.id,
          locationId: f.locationA.id,
          ticketId: ticket.id,
          orderItemId: item.id,
          position: item.position,
          productName: item.productName,
          productSku: item.productSku,
          quantity: item.quantity,
          note: item.note,
          // The database must take the course from the order item, not this forged input.
          courseNumber: 3,
        })),
      });
      await tx.order.update({
        where: { id: draft.order.id },
        data: { status: 'CONFIRMED', kitchenStatus: 'QUEUED', version: 3 },
      });
      await reserveOrder(tx, {
        organizationId: f.a.organization.id,
        locationId: f.locationA.id,
        orderId: draft.order.id,
        requestKey: ticket.requestKey,
        requestHash: ticket.requestHash,
        actorUserId: f.a.user.id,
        actorName: 'Sintetic',
        serviceType: 'DINE_IN',
        items: items.map((item) => ({
          id: item.id,
          productId: item.productId,
          productName: item.productName,
          quantity: item.quantity.toFixed(3),
        })),
      });
      return ticket;
    })
    .catch(async (error: unknown) => {
      await Promise.all([f.runtime.$disconnect(), f.platform.$disconnect(), f.auth.$disconnect()]);
      throw error;
    });
  return { ...f, ticket };
}
