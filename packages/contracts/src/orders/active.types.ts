import type { Order } from './orders.types';
import type { ACTIVE_ORDER_REASONS } from './config/order-active.constants';

export type ActiveOrderReason = (typeof ACTIVE_ORDER_REASONS)[number];
export interface ActiveOrder extends Order {
  activeReasons: ActiveOrderReason[];
}
export interface ActiveOrdersRequest {
  locationId: string;
  limit?: number;
  cursor?: string;
}
export interface ActiveOrdersResponse {
  orders: ActiveOrder[];
  nextCursor: string | null;
  timezone: string;
}
