import type { TenantTransaction } from '@pos/db';
import { assert } from '../../../shared/lib/http';
import { totalAmount } from '../../../shared/lib/money';
export async function refundCashAmount(
  tx: TenantTransaction,
  orderId: string,
  refunds: Array<{ paymentId: string; amount: string }>,
) {
  const payments = await tx.payment.findMany({
    where: { orderId, id: { in: refunds.map((line) => line.paymentId) } },
  });
  assert(payments.length === refunds.length, 404, 'Plata originală nu aparține comenzii');
  const cashIds = new Set(
    payments.filter((payment) => payment.method === 'CASH').map((payment) => payment.id),
  );
  return totalAmount(
    refunds.filter((line) => cashIds.has(line.paymentId)).map((line) => line.amount),
  );
}
