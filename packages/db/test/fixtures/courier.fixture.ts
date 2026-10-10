import { randomUUID } from 'node:crypto';
import type { Prisma } from '../../src';
import { createCustomerAddressFixture } from './customer-address.fixture';
export async function createCourierFixture() {
  const f = await createCustomerAddressFixture();
  const courierId = randomUUID();
  const command = (
    overrides: Partial<Prisma.CourierCommandUncheckedCreateInput> = {},
  ): Prisma.CourierCommandUncheckedCreateInput => ({
    organizationId: f.a.organization.id,
    locationId: f.locationA.id,
    courierId,
    actorUserId: f.a.user.id,
    requestKey: randomUUID(),
    action: 'CREATE',
    status: 'SUCCEEDED',
    requestHash: 'c'.repeat(64),
    userId: f.a.user.id,
    profile: { vehicle: 'BICYCLE', capacity: 2 },
    ...overrides,
  });
  const current = () => f.txA((tx) => tx.courier.findUniqueOrThrow({ where: { id: courierId } }));
  const delivery = async () => {
    const { order } = await f.createDraft();
    return f.txA((tx) =>
      tx.order.update({
        where: { id: order.id },
        data: {
          serviceType: 'DELIVERY',
          status: 'CONFIRMED',
          tableLabel: null,
          version: { increment: 1 },
        },
      }),
    );
  };
  const close = () =>
    Promise.all([f.runtime.$disconnect(), f.platform.$disconnect(), f.auth.$disconnect()]);
  return { ...f, courierId, command, current, delivery, close };
}
