import type { StoredOrder } from '../../../entities/order';
import { totalAmount } from '../../../shared/lib/money';
export function draftDeliveryFee(
  current: StoredOrder,
  serviceType: string,
  addressHash: string | null | undefined,
  subtotal: string,
) {
  const retained =
    current.deliveryFeeCommandId !== null &&
    serviceType === 'DELIVERY' &&
    (addressHash === undefined || addressHash === current.deliveryAddressHash) &&
    totalAmount([subtotal, current.deliveryFee.toFixed(2)]) === current.total.toFixed(2);
  const deliveryFee = retained ? current.deliveryFee.toFixed(2) : '0.00';
  return {
    deliveryFee,
    deliveryFeeCommandId: retained ? current.deliveryFeeCommandId : null,
    total: totalAmount([subtotal, deliveryFee]),
  };
}
