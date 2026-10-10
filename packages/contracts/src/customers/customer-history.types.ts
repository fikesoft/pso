import type { z } from 'zod';
import type { OrdersResponse } from '../orders';
import type { customerHistoryQuerySchema } from './customer-history.schema';

export type CustomerHistoryQuery = z.output<typeof customerHistoryQuerySchema>;
export interface CustomerHistoryResponse extends OrdersResponse {
  customerId: string;
  locationId: string;
}
