import { randomUUID } from 'node:crypto';
import type { Prisma } from '../../src';
import { createCourierFixture } from './courier.fixture';
import { writeDelivery } from './delivery.fixture';
export async function createCourierAcceptanceFixture() {
  const f = await createCourierFixture();
  await f.txA((tx) => tx.courierCommand.create({ data: f.command() }));
  await f.txA((tx) =>
    tx.courierCommand.create({
      data: f.command({
        action: 'SET_AVAILABILITY',
        expectedVersion: 1,
        availability: 'AVAILABLE',
        profile: undefined,
      }),
    }),
  );
  const draft = await f.delivery();
  const assignment = await f.txA((tx) =>
    writeDelivery(tx, draft.id, { toStatus: 'ASSIGNED', courierUserId: f.a.user.id }),
  );
  const order = await f.txA((tx) => tx.order.findUniqueOrThrow({ where: { id: draft.id } }));
  const acceptance = (
    overrides: Partial<Prisma.CourierAcceptanceCommandUncheckedCreateInput> = {},
  ): Prisma.CourierAcceptanceCommandUncheckedCreateInput => ({
    organizationId: f.a.organization.id,
    locationId: f.locationA.id,
    orderId: order.id,
    assignmentId: assignment.id,
    courierId: f.courierId,
    actorUserId: f.a.user.id,
    requestKey: randomUUID(),
    status: 'SUCCEEDED',
    requestHash: 'a'.repeat(64),
    expectedOrderVersion: order.version,
    ...overrides,
  });
  return { ...f, order, assignment, acceptance };
}
