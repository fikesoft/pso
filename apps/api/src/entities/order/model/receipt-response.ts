import type {
  CheckoutMode,
  CheckoutSummary,
  PaymentMethod,
  Receipt,
  ServiceType,
} from '@pos/contracts';
import type { TenantTransaction } from '@pos/db';
import { loadOrderItemModifierSnapshots } from './order-snapshots';
import { assert } from '../../../shared/lib/http';
import type { StoredCheckout } from './order.types';

export function checkoutSummary(checkout: StoredCheckout): CheckoutSummary {
  return {
    id: checkout.id,
    mode: checkout.mode as CheckoutMode,
    method: checkout.method as PaymentMethod | null,
    total: checkout.total.toFixed(2),
    createdAt: checkout.createdAt.toISOString(),
  };
}

export async function receiptResponse(
  tx: TenantTransaction,
  checkout: StoredCheckout,
): Promise<Receipt> {
  const [order, items, payment] = await Promise.all([
    tx.order.findUnique({ where: { id: checkout.orderId } }),
    tx.orderItem.findMany({ where: { orderId: checkout.orderId }, orderBy: { position: 'asc' } }),
    tx.payment.findFirst({ where: { checkoutId: checkout.id }, select: { id: true } }),
  ]);
  assert(order, 404, 'Comanda nu există');
  const modifiers = await loadOrderItemModifierSnapshots(
    tx,
    items.map((item) => item.id),
  );
  return {
    ...checkoutSummary(checkout),
    deliveryFee: order.deliveryFee.toFixed(2),
    number: `${checkout.mode === 'DEMO' ? 'DEMO' : 'INC'}-${order.number}`,
    orderId: order.id,
    orderNumber: order.number,
    serviceType: order.serviceType as ServiceType,
    tableLabel: order.tableLabel,
    companyName: checkout.companyName,
    locationName: checkout.locationName,
    locationCode: checkout.locationCode,
    cashierName: checkout.cashierName,
    currency: 'MDL',
    receivedAmount: checkout.receivedAmount?.toFixed(2) ?? null,
    changeAmount: checkout.changeAmount?.toFixed(2) ?? null,
    paymentId: payment?.id ?? null,
    isFiscal: false,
    items: items.map((item) => ({
      productName: item.productName,
      productSku: item.productSku,
      quantity: item.quantity.toFixed(3),
      unitPrice: item.unitPrice.toFixed(4),
      taxRateSnapshot: item.taxRateSnapshot?.toFixed(4) ?? null,
      lineTotal: item.lineTotal.toFixed(2),
      modifierGroups: modifiers.get(item.id) ?? [],
    })),
  };
}
