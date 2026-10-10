import type { z } from 'zod';
import type {
  orderDeliveryFeeCommandSchema,
  orderDeliveryFeePreviewSchema,
  orderDeliveryFeePreviewResponseSchema,
} from './order-delivery-fee.schema';
import type { Order } from '../orders';
export type OrderDeliveryFeeCommand = z.infer<typeof orderDeliveryFeeCommandSchema>;
export type OrderDeliveryFeePreview = z.infer<typeof orderDeliveryFeePreviewSchema>;
export type OrderDeliveryFeeQuote = z.infer<typeof orderDeliveryFeePreviewResponseSchema>;
export interface OrderDeliveryFeeResult {
  requestKey: string;
  resultVersion: number | null;
  order: Order;
}
export interface OrderDeliveryFeeResolution extends OrderDeliveryFeeResult {
  status: 'SUCCEEDED' | 'RETIRED';
}
