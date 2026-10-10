import type { OrderReviewModel } from './order-review.types';
import type { useOrderDeliveryFee } from './use-order-delivery-fee';
export interface DeliveryFeeInput {
  model: OrderReviewModel;
  isBlocked: () => boolean;
}
export interface DeliveryFeeProps {
  model: ReturnType<typeof useOrderDeliveryFee>;
  disabled: boolean;
}
