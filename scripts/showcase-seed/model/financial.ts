import { withTenantTransaction } from '../../../packages/db/src/index';
import { decimalString, decimalUnits } from '../../../apps/api/src/shared/lib/money';
import { seedKey } from './record';
import type { OrderResult, SeedClients, SeedLocationContext } from './seed.types';

export async function seedFinancial(
  clients: SeedClients,
  context: SeedLocationContext,
  orderId: string,
  scenario: string,
) {
  const { record, references, operator, cashier, shiftId } = context;
  let { order } = await operator.call<OrderResult>(`/orders/${orderId}`);
  if (scenario === 'DEMO' || scenario === 'CASH' || scenario === 'CARD') {
    if (order.status === 'COMPLETED') return;
    const mode = scenario === 'DEMO' ? 'demo' : 'manual';
    await (scenario === 'DEMO' ? operator : cashier).call(
      `/orders/${orderId}/checkout/${mode}`,
      'POST',
      {
        version: order.version,
        requestKey: seedKey(record, `checkout:${orderId}`),
        ...(scenario === 'DEMO'
          ? {}
          : {
              method: scenario,
              confirmed: true,
              cashShiftId: shiftId,
              ...(scenario === 'CASH' ? { receivedAmount: order.total } : {}),
            }),
      },
    );
    return;
  }
  if (scenario === 'MIXED' || scenario === 'REFUNDED') {
    const requestKey = seedKey(record, `collect:${orderId}`);
    const previous = await withTenantTransaction(
      clients.runtime,
      { organizationId: references.organizationId },
      (tx) => tx.paymentOperation.findFirst({ where: { orderId, requestKey } }),
    );
    if (!previous) {
      const half = decimalString(decimalUnits(order.total, 2) / 2n, 2);
      const rest = decimalString(decimalUnits(order.total, 2) - decimalUnits(half, 2), 2);
      await cashier.call(`/orders/${orderId}/payments`, 'POST', {
        version: order.version,
        requestKey,
        confirmed: true,
        cashShiftId: shiftId,
        payments:
          scenario === 'MIXED'
            ? [
                { method: 'CASH', amount: half, receivedAmount: half },
                { method: 'CARD', amount: rest },
              ]
            : [{ method: 'CARD', amount: order.total }],
      });
      ({ order } = await operator.call<OrderResult>(`/orders/${orderId}`));
    }
  }
  if (order.status !== 'COMPLETED') {
    await operator.call(`/orders/${orderId}/complete`, 'POST', {
      version: order.version,
      requestKey: seedKey(record, `complete:${orderId}`),
    });
    ({ order } = await operator.call<OrderResult>(`/orders/${orderId}`));
  }
  if (scenario === 'REFUNDED') {
    const requestKey = seedKey(record, `refund:${orderId}`);
    const stored = await withTenantTransaction(
      clients.runtime,
      { organizationId: references.organizationId },
      async (tx) => ({
        refund: await tx.paymentOperation.findFirst({ where: { orderId, requestKey } }),
        payment: await tx.payment.findFirstOrThrow({ where: { orderId } }),
      }),
    );
    if (!stored.refund)
      await cashier.call(`/orders/${orderId}/refunds`, 'POST', {
        version: order.version,
        requestKey,
        confirmed: true,
        cashShiftId: shiftId,
        reason: 'DEMO · rambursare parțială sintetică pentru exercițiu',
        refunds: [
          {
            paymentId: stored.payment.id,
            amount: decimalString(decimalUnits(stored.payment.amount.toFixed(2), 2) / 4n, 2),
          },
        ],
      });
  }
}
