import { randomUUID } from 'node:crypto';
import type { TenantTransaction } from '../../src';
import { createOperationsFixture } from './operations.fixture';
import { openCashShiftFixture } from './cash-shift.fixture';
import type { ResponsibilityFixtureCommand } from './order-responsibility.types';
export async function createResponsibilityFixture() {
  const f = await createOperationsFixture();
  const shift = await openCashShiftFixture(f, 'a', f.locationA.id, '20');
  const confirmed = async () => {
    const { order } = await f.createDraft();
    return f.txA((tx) =>
      tx.order.update({
        where: { id: order.id },
        data: { status: 'CONFIRMED', version: { increment: 1 } },
      }),
    );
  };
  return { ...f, shift, confirmed };
}
export async function writeResponsibility(
  tx: TenantTransaction,
  orderId: string,
  command: ResponsibilityFixtureCommand,
) {
  const order = await tx.order.findUniqueOrThrow({ where: { id: orderId } });
  const previous = await tx.orderResponsibility.findFirst({ where: { orderId } });
  const requestKey = command.requestKey ?? randomUUID(),
    id = randomUUID();
  const targets = {
    sourceShiftId: command.sourceShiftId ?? null,
    targetShiftId: command.targetShiftId ?? null,
    handoffEventId: command.handoffEventId ?? null,
  };
  const base = {
    organizationId: order.organizationId,
    locationId: order.locationId,
    orderId,
    actorUserId: command.actor ?? order.updatedByUserId,
    kind: command.kind,
    requestKey,
    ...targets,
  };
  const insertCommand = () =>
    tx.orderResponsibilityCommand.create({
      data: {
        ...base,
        status: 'SUCCEEDED',
        requestHash: command.requestHash ?? 'f'.repeat(64),
        resultEventId: id,
      },
    });
  if (command.commandFirst && command.omit !== 'command') await insertCommand();
  if (command.omit !== 'event')
    await tx.orderResponsibilityEvent.create({
      data: {
        ...base,
        id,
        version: (command.previousVersion ?? previous?.version ?? 0) + 1,
        previousVersion: command.previousVersion ?? previous?.version ?? 0,
        orderVersion: command.orderVersion ?? order.version,
        reason: 'Predare sintetică verificată',
        managerReason: command.managerReason,
      },
    });
  if (!command.commandFirst && command.omit !== 'command') await insertCommand();
  return { id, requestKey };
}
