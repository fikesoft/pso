import type { z } from 'zod';
import type { orderSearchSchema } from './order-search.schema';
import type { OrdersResponse } from './orders.types';

export type OrderSearchRequest = z.input<typeof orderSearchSchema>;
export interface OrderSearchResponse extends OrdersResponse {
  timezone: string;
}
