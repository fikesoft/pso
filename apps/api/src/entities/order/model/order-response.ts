import { readOrderAddress } from './order-address';
import { readOrderCustomer } from './order-customer';
import type { TenantTransaction } from '@pos/db';
import { loadOrderItemModifierSnapshots } from './order-snapshots';
import type { StoredOrder } from './order.types';
import { checkoutSummary } from './receipt-response';
import { effectiveOrderStatus, effectiveKitchenStatus } from './order-status';
import { paymentSummary } from './payment-summary';

export async function orderResponse(
  tx: TenantTransaction,
  order: StoredOrder,
  discloseCustomer = false,
) {
  const items = await tx.orderItem.findMany({
    where: { orderId: order.id },
    orderBy: { position: 'asc' },
  });
  const modifiers = await loadOrderItemModifierSnapshots(
    tx,
    items.map((item) => item.id),
  );
  const checkout =
    order.status === 'COMPLETED'
      ? await tx.checkout.findFirst({ where: { orderId: order.id } })
      : null;
  const financial = await paymentSummary(tx, order.id);
  const packing = await tx.packingSession.findFirst({
    where: {
      organizationId: order.organizationId,
      locationId: order.locationId,
      orderId: order.id,
    },
    select: { handoverRequired: true, status: true },
  });
  return {
    id: order.id,
    locationId: order.locationId,
    brandId: order.brandId,
    source: order.source,
    number: order.number,
    createdByUserId: order.createdByUserId,
    ...(discloseCustomer
      ? {
          customer: readOrderCustomer(order),
          deliveryAddress: readOrderAddress(order),
          addressRef: order.customerAddressId
            ? { id: order.customerAddressId, version: order.customerAddressVersionSnapshot! }
            : null,
          customerRef: order.customerId
            ? {
                id: order.customerId,
                version: order.customerVersionSnapshot!,
              }
            : null,
        }
      : {}),
    status: effectiveOrderStatus(order.status, order.kitchenStatus),
    paymentStatus: financial.status,
    paymentSummary: financial,
    deliveryStatus:
      order.deliveryStatus ?? (order.serviceType === 'DELIVERY' ? null : 'NOT_REQUIRED'),
    deliveryCourierId: order.deliveryCourierId,
    deliveryCourierName: order.deliveryCourierName,
    serviceType: order.serviceType,
    tableLabel: order.tableLabel,
    ...(order.tableVisitId ? { tableVisitId: order.tableVisitId } : {}),
    notes: order.notes,
    currency: order.currency,
    total: order.total.toFixed(2),
    deliveryFee: order.deliveryFee.toFixed(2),
    deliveryFeeConfirmed: order.deliveryFeeCommandId !== null,
    version: order.version,
    kitchenStatus: effectiveKitchenStatus(order.kitchenStatus),
    packingStatus: packing?.handoverRequired ? packing.status : 'NOT_REQUIRED',
    createdAt: order.createdAt,
    updatedAt: order.updatedAt,
    checkout: checkout ? checkoutSummary(checkout) : null,
    items: items.map((item) => ({
      id: item.id,
      productId: item.productId,
      position: item.position,
      productName: item.productName,
      productSku: item.productSku,
      unitPrice: item.unitPrice.toFixed(4),
      taxRateSnapshot: item.taxRateSnapshot?.toFixed(4) ?? null,
      baseUnitPrice: item.baseUnitPrice.toFixed(4),
      quantity: item.quantity.toFixed(3),
      courseNumber: item.courseNumber,
      lineTotal: item.lineTotal.toFixed(2),
      note: item.note,
      modifierGroups: modifiers.get(item.id) ?? [],
    })),
  };
}
