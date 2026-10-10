import type { z } from 'zod';
import type {
  courierWorkQuerySchema,
  courierWorkItemSchema,
  courierWorkListResponseSchema,
} from './courier-work.schema';
export type CourierWorkQuery = z.infer<typeof courierWorkQuerySchema>;
export type CourierWorkItem = z.infer<typeof courierWorkItemSchema>;
export type CourierWorkListResponse = z.infer<typeof courierWorkListResponseSchema>;
import type {
  courierAcceptanceSchema,
  courierAcceptanceResolutionSchema,
} from './courier-acceptance.schema';
export type CourierAcceptance = z.infer<typeof courierAcceptanceSchema>;
export type CourierAcceptanceResolution = z.infer<typeof courierAcceptanceResolutionSchema>;
