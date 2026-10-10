import { randomUUID } from 'node:crypto';
import type { TenantTransaction } from '../../src';

export async function completePackingFixture(
  tx: TenantTransaction,
  orderId: string,
  actorUserId: string,
) {
  const session = await tx.packingSession.findFirstOrThrow({ where: { orderId } });
  const base = {
    organizationId: session.organizationId,
    locationId: session.locationId,
    sessionId: session.id,
    actorUserId,
    status: 'SUCCEEDED',
    requestHash: 'd'.repeat(64),
  };
  let version = session.version;
  if (session.status === 'READY') return tx.order.findUniqueOrThrow({ where: { id: orderId } });
  if (session.status === 'WAITING')
    await tx.packingCommand.create({
      data: {
        ...base,
        action: 'START',
        expectedVersion: version++,
        requestKey: randomUUID(),
      },
    });
  const items = await tx.packingItem.findMany({ where: { sessionId: session.id, checked: false } });
  for (const item of items)
    await tx.packingCommand.create({
      data: {
        ...base,
        action: 'CHECK_ITEM',
        itemId: item.id,
        checked: true,
        expectedVersion: version++,
        requestKey: randomUUID(),
      },
    });
  await tx.packingCommand.create({
    data: {
      ...base,
      action: 'COMPLETE',
      expectedVersion: version,
      requestKey: randomUUID(),
    },
  });
  return tx.order.findUniqueOrThrow({ where: { id: orderId } });
}
