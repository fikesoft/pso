import type { TenantTransaction } from '../../src';
import { consumeOrder } from '../../../../apps/api/src/entities/inventory';
import type { ResponsibilityCheckoutData } from './responsibility-checkout.types';
export async function responsibilityCheckout(
  tx: TenantTransaction,
  data: ResponsibilityCheckoutData,
  mode: 'MANUAL' | 'DEMO',
  shiftId: string,
) {
  const checkout = await tx.checkout.create({
    data: {
      ...data,
      mode,
      ...(mode === 'MANUAL'
        ? { method: 'CARD', receivedAmount: data.total, changeAmount: '0', cashShiftId: shiftId }
        : {}),
    },
  });
  if (mode === 'MANUAL')
    await tx.payment.create({
      data: {
        organizationId: data.organizationId,
        locationId: data.locationId,
        orderId: data.orderId,
        checkoutId: checkout.id,
        cashShiftId: checkout.cashShiftId,
        amount: data.total,
        currency: data.currency,
        method: 'CARD',
        confirmedByUserId: data.createdByUserId,
      },
    });
  await tx.order.update({
    where: { id: data.orderId },
    data: { status: 'COMPLETED', version: { increment: 1 } },
  });
  await consumeOrder(tx, {
    organizationId: data.organizationId,
    locationId: data.locationId,
    orderId: data.orderId,
    requestKey: checkout.requestKey,
    requestHash: checkout.requestHash,
    actorUserId: data.createdByUserId,
    actorName: checkout.cashierName,
  });
  await tx.orderStatusEvent.create({
    data: {
      organizationId: data.organizationId,
      locationId: data.locationId,
      orderId: data.orderId,
      kind: 'ORDER',
      fromStatus: 'READY',
      toStatus: 'COMPLETED',
      actorUserId: data.createdByUserId,
    },
  });
  return checkout;
}
