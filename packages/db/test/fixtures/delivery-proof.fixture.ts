import { randomUUID } from 'node:crypto';
import type { Prisma, TenantTransaction } from '../../src';
import { createInventoryFixture } from './inventory.fixture';
import { sendInventoryOrder } from './inventory-send.fixture';
import { readyInventoryOrder } from './inventory-finalize.fixture';
import { writeDelivery } from './delivery.fixture';
export async function createDeliveryProofFixture() {
  const f = await createInventoryFixture(),
    courierId = randomUUID();
  const scope = {
    organizationId: f.a.organization.id,
    locationId: f.locationA.id,
    actorUserId: f.a.user.id,
  };
  await f.txA((tx) =>
    tx.courierCommand.create({
      data: {
        ...scope,
        courierId,
        userId: f.a.user.id,
        requestKey: randomUUID(),
        action: 'CREATE',
        status: 'SUCCEEDED',
        requestHash: 'c'.repeat(64),
        profile: { vehicle: 'BICYCLE', capacity: 2 },
      },
    }),
  );
  await f.txA((tx) =>
    tx.courierCommand.create({
      data: {
        ...scope,
        courierId,
        requestKey: randomUUID(),
        action: 'SET_AVAILABILITY',
        status: 'SUCCEEDED',
        requestHash: 'a'.repeat(64),
        expectedVersion: 1,
        availability: 'AVAILABLE',
      },
    }),
  );
  const sent = await sendInventoryOrder(f, { serviceType: 'DELIVERY', quantity: '1' });
  await readyInventoryOrder(f, sent);
  const assignment = await f.txA((tx) =>
    writeDelivery(tx, sent.order.id, { toStatus: 'ASSIGNED', courierUserId: f.a.user.id }),
  );
  await f.txA((tx) =>
    tx.courierAcceptanceCommand.create({
      data: {
        ...scope,
        courierId,
        orderId: sent.order.id,
        assignmentId: assignment.id,
        requestKey: randomUUID(),
        status: 'SUCCEEDED',
        requestHash: 'b'.repeat(64),
        expectedOrderVersion: assignment.orderVersion,
      },
    }),
  );
  await f.txA((tx) => writeDelivery(tx, sent.order.id, { toStatus: 'PICKED_UP' }));
  await f.txA((tx) => writeDelivery(tx, sent.order.id, { toStatus: 'DELIVERING' }));
  const proof = (
    operationId: string,
    patch: Partial<Prisma.DeliveryProofUncheckedCreateInput> = {},
  ): Prisma.DeliveryProofUncheckedCreateInput => ({
    ...scope,
    orderId: sent.order.id,
    assignmentId: assignment.id,
    operationId,
    privateDataEncrypted: Buffer.from('synthetic encrypted delivery proof'.repeat(3)).toString(
      'base64',
    ),
    ...patch,
  });
  const deliver = async (tx: TenantTransaction, requestKey = randomUUID()) => {
    const op = await writeDelivery(tx, sent.order.id, {
      toStatus: 'DELIVERED',
      operation: { requestKey },
    });
    return tx.deliveryProof.create({ data: proof(op.id) });
  };
  const close = () =>
    Promise.all([f.runtime.$disconnect(), f.platform.$disconnect(), f.auth.$disconnect()]);
  return { ...f, scope, sent, assignment, courierId, proof, deliver, close };
}
