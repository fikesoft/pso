import type { TenantTransaction } from '@pos/db';
import { assert } from '../../../shared/lib/http';
import { decimalString, decimalUnits } from '../../../shared/lib/money';
import type { PaymentCommand, StoredPaymentOperation } from './payments.types';

export async function writeAllocations(
  tx: TenantTransaction,
  operation: StoredPaymentOperation,
  command: PaymentCommand,
) {
  const scope = {
    organizationId: operation.organizationId,
    locationId: operation.locationId,
    orderId: operation.orderId,
    operationId: operation.id,
    cashShiftId: operation.cashShiftId,
    currency: operation.currency,
  };
  if (command.kind === 'COLLECT') {
    for (const line of command.body.payments) {
      const amount = decimalUnits(line.amount, 2);
      const received = line.method === 'CASH' ? decimalUnits(line.receivedAmount, 2) : amount;
      assert(received >= amount, 400, 'Numerarul primit este mai mic decât suma încasată');
      await tx.payment.create({
        data: {
          ...scope,
          method: line.method,
          amount: line.amount,
          confirmedByUserId: operation.actorUserId,
          receivedAmount: decimalString(received, 2),
          changeAmount: decimalString(received - amount, 2),
        },
      });
    }
  } else {
    for (const line of command.body.refunds) {
      const payment = await tx.payment.findFirst({
        where: { id: line.paymentId, orderId: operation.orderId },
      });
      assert(payment, 404, 'Plata originală nu aparține comenzii');
      const previous = await tx.paymentRefund.aggregate({
        where: { paymentId: payment.id },
        _sum: { amount: true },
      });
      const remaining =
        decimalUnits(payment.amount.toFixed(2), 2) -
        decimalUnits(previous._sum.amount?.toFixed(2) ?? '0.00', 2);
      assert(
        decimalUnits(line.amount, 2) <= remaining,
        409,
        'Suma depășește soldul rambursabil al plății originale',
      );
      await tx.paymentRefund.create({
        data: {
          ...scope,
          paymentId: payment.id,
          method: payment.method,
          amount: line.amount,
          actorUserId: operation.actorUserId,
        },
      });
    }
  }
}
