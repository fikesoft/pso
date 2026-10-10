import { randomUUID } from 'node:crypto';
import type { Prisma } from '../../src';
import {
  createCustomerAddressFixture,
  addressData,
  addressOrderFields,
} from './customer-address.fixture';
import { deliveryZoneCommandData, deliveryZoneProfile } from './delivery-zone.fixture';

export async function createOrderDeliveryFeeFixture() {
  const f = await createCustomerAddressFixture();
  const address = await f.txA((tx) => tx.customerAddress.create({ data: addressData(f) }));
  const draft = await f.createDraft();
  const order = await f.txA((tx) =>
    tx.order.update({
      where: { id: draft.order.id },
      data: {
        ...addressOrderFields(f.customer.id, address.id),
        tableLabel: null,
        version: { increment: 1 },
      },
    }),
  );
  const zone = await f.txA((tx) =>
    tx.deliveryZoneCommand.create({
      data: deliveryZoneCommandData(f, {
        profile: { ...deliveryZoneProfile(), minimumOrder: '0.00' },
      }),
    }),
  );
  const command = (
    overrides: Partial<Prisma.OrderDeliveryFeeCommandUncheckedCreateInput> = {},
  ): Prisma.OrderDeliveryFeeCommandUncheckedCreateInput => ({
    organizationId: f.a.organization.id,
    locationId: f.locationA.id,
    orderId: order.id,
    actorUserId: f.a.user.id,
    requestKey: randomUUID(),
    status: 'SUCCEEDED',
    requestHash: 'a'.repeat(64),
    expectedVersion: order.version,
    zoneId: zone.zoneId,
    zoneVersion: 1,
    destination: { latitude: 47.02, longitude: 28.83 },
    subtotal: '10.01',
    fee: '25.00',
    total: '35.01',
    ...overrides,
  });
  const current = () => f.txA((tx) => tx.order.findUniqueOrThrow({ where: { id: order.id } }));
  const close = () =>
    Promise.all([f.runtime.$disconnect(), f.platform.$disconnect(), f.auth.$disconnect()]);
  return { ...f, order, item: draft.item, zone, address, command, current, close };
}
