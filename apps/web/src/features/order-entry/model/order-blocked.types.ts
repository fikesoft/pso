import type { OrderReviewModel } from './order-review.types';
import type { ReactNode } from 'react';
import type { useOrderCheckout } from './use-order-checkout';
import type { useOrderDelivery } from './use-order-delivery';
import type { useOrderPayments } from './use-order-payments';
import type { useOrderDeliveryFee } from './use-order-delivery-fee';
export interface OrderBlockedProps {
  model: OrderReviewModel;
  recoveryExtension?: ReactNode;
  checkout: ReturnType<typeof useOrderCheckout>;
  payments: ReturnType<typeof useOrderPayments>;
  delivery: ReturnType<typeof useOrderDelivery>;
  fees: ReturnType<typeof useOrderDeliveryFee>;
}
