import { completePackingFixture } from './packing-complete.fixture';
import { consumeOrder } from '../../../../apps/api/src/entities/inventory';
import { createHash, randomUUID } from 'node:crypto';
import { publishKitchenFixture } from './operations-kitchen.fixture';
import type { OperationsFixture } from './operations.types';
import type { CheckoutOrder, CheckoutOverrides, CheckoutWriteOptions } from './checkout.types';

export async function prepareCheckoutOrder(state: OperationsFixture, zeroTotal = false) {
  let draft = await state.createDraft();
  if (zeroTotal) {
    draft = await state.txA(async (tx) => {
      await tx.orderItem.delete({ where: { id: draft.item.id } });
      const item = await tx.orderItem.create({
        data: {
          ...draft.item,
          id: randomUUID(),
          baseUnitPrice: '0',
          unitPrice: '0',
          lineTotal: '0',
        },
      });
      const order = await tx.order.update({
        where: { id: draft.order.id },
        data: { total: '0', version: { increment: 1 } },
      });
      return { order, item };
    });
  }
  const { ticket } = await publishKitchenFixture(state, draft);
  for (const status of ['PREPARING', 'READY']) {
    await state.txA(async (tx) => {
      await tx.kitchenTicket.update({
        where: { id: ticket.id },
        data: {
          status,
          updatedByUserId: state.a.user.id,
          version: { increment: 1 },
        },
      });
      await tx.order.update({
        where: { id: draft.order.id },
        data: {
          status: 'IN_PROGRESS',
          kitchenStatus: status,
          updatedByUserId: state.a.user.id,
          version: { increment: 1 },
        },
      });
    });
  }
  return state.txA((tx) => completePackingFixture(tx, draft.order.id, state.a.user.id));
}

export async function checkoutData(state: OperationsFixture, order: CheckoutOrder) {
  return state.txA(async (tx) => {
    const company = await tx.organization.findUniqueOrThrow({
      where: { id: state.a.organization.id },
    });
    const location = await tx.location.findUniqueOrThrow({ where: { id: order.locationId } });
    const cashier = await tx.companyUser.findUniqueOrThrow({ where: { id: state.a.user.id } });
    return {
      organizationId: company.id,
      locationId: location.id,
      orderId: order.id,
      requestKey: randomUUID(),
      requestHash: createHash('sha256').update(randomUUID()).digest('hex'),
      mode: 'DEMO',
      method: null,
      currency: 'MDL',
      total: order.total,
      receivedAmount: null,
      changeAmount: null,
      companyName: company.name,
      locationName: location.name,
      locationCode: location.code,
      cashierName: cashier.displayName,
      createdByUserId: cashier.id,
    };
  });
}

export async function writeCheckout(
  state: OperationsFixture,
  order: CheckoutOrder,
  overrides: CheckoutOverrides = {},
  options: CheckoutWriteOptions = {},
) {
  const data = await checkoutData(state, order);
  return state.txA(async (tx) => {
    const checkout = await tx.checkout.create({ data: { ...data, ...overrides } });
    const payment =
      checkout.mode === 'MANUAL' && !options.skipPayment
        ? await tx.payment.create({
            data: {
              organizationId: checkout.organizationId,
              locationId: checkout.locationId,
              checkoutId: checkout.id,
              cashShiftId: checkout.cashShiftId,
              orderId: checkout.orderId,
              amount: checkout.total,
              currency: checkout.currency,
              method: checkout.method!,
              confirmedByUserId: checkout.createdByUserId,
              ...options.payment,
            },
          })
        : null;
    if (!options.skipCompletion) {
      await tx.order.update({
        where: { id: order.id },
        data: {
          status: 'COMPLETED',
          updatedByUserId: state.a.user.id,
          version: { increment: 1 },
        },
      });
    }
    if (!options.skipCompletion && !options.skipInventory) {
      await consumeOrder(tx, {
        organizationId: checkout.organizationId,
        locationId: checkout.locationId,
        orderId: checkout.orderId,
        requestKey: checkout.requestKey,
        requestHash: checkout.requestHash,
        actorUserId: checkout.createdByUserId,
        actorName: checkout.cashierName,
      });
    }
    return { checkout, payment };
  });
}
