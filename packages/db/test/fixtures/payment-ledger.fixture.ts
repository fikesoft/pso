import { randomUUID } from 'node:crypto';
import { Prisma } from '../../src';
import type { TenantTransaction } from '../../src';
import type { LedgerTestCommand } from './payment-ledger.types';

export async function writeFinancialCommand(
  tx: TenantTransaction,
  orderId: string,
  command: LedgerTestCommand,
) {
  const order = await tx.order.findUniqueOrThrow({ where: { id: orderId } });
  const amount = [...(command.payments ?? []), ...(command.refunds ?? [])].reduce(
    (sum, line) => sum.add(line.amount),
    new Prisma.Decimal(0),
  );
  const operation = await tx.paymentOperation.create({
    data: {
      organizationId: order.organizationId,
      locationId: order.locationId,
      orderId,
      cashShiftId: command.cashShiftId,
      requestKey: randomUUID(),
      requestHash: 'f'.repeat(64),
      kind: command.refunds ? 'REFUND' : 'COLLECT',
      amount,
      orderVersion: order.version + 1,
      currency: order.currency,
      actorUserId: order.updatedByUserId,
      reason: command.refunds ? 'Rambursare sintetică verificată' : null,
      ...command.operation,
    },
  });
  const payments = [];
  if (command.omit !== 'lines') {
    for (const line of command.payments ?? [])
      payments.push(
        await tx.payment.create({
          data: {
            organizationId: order.organizationId,
            locationId: order.locationId,
            orderId,
            operationId: operation.id,
            cashShiftId: operation.cashShiftId,
            amount: line.amount,
            method: line.method ?? 'CASH',
            receivedAmount: line.receivedAmount ?? line.amount,
            changeAmount: new Prisma.Decimal(line.receivedAmount ?? line.amount).sub(line.amount),
            currency: order.currency,
            confirmedByUserId: operation.actorUserId,
          },
        }),
      );
    for (const line of command.refunds ?? []) {
      const original = await tx.payment.findUnique({ where: { id: line.paymentId } });
      await tx.paymentRefund.create({
        data: {
          organizationId: order.organizationId,
          locationId: order.locationId,
          orderId,
          operationId: operation.id,
          cashShiftId: operation.cashShiftId,
          amount: line.amount,
          paymentId: line.paymentId,
          method: line.method ?? original?.method ?? 'CASH',
          currency: order.currency,
          actorUserId: operation.actorUserId,
        },
      });
    }
  }
  if (command.omit !== 'order')
    await tx.order.update({
      where: { id: order.id },
      data: {
        version: { increment: 1 },
        updatedByUserId: operation.actorUserId,
      },
    });
  if (command.omit !== 'event')
    await tx.orderStatusEvent.create({
      data: {
        organizationId: order.organizationId,
        locationId: order.locationId,
        orderId,
        kind: 'PAYMENT',
        fromStatus: operation.fromStatus,
        toStatus: operation.toStatus,
        actorUserId: operation.actorUserId,
        requestKey: operation.requestKey,
        requestHash: operation.requestHash,
        orderVersion: operation.orderVersion,
        reason: operation.reason,
        ...command.event,
      },
    });
  return { operation, payments };
}
