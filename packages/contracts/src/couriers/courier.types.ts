import type { z } from 'zod';
import type {
  courierProfileSchema,
  courierSchema,
  courierQuerySchema,
  courierListResponseSchema,
  courierCandidateResponseSchema,
} from './courier.schema';
import type {
  courierCommandSchema,
  courierResolutionSchema,
  courierResultSchema,
  courierCommandResponseSchema,
  courierResolutionResponseSchema,
} from './courier-command.schema';
export type CourierProfile = z.infer<typeof courierProfileSchema>;
export type Courier = z.infer<typeof courierSchema>;
export type CourierQuery = z.infer<typeof courierQuerySchema>;
export type CourierListResponse = z.infer<typeof courierListResponseSchema>;
export type CourierCandidateResponse = z.infer<typeof courierCandidateResponseSchema>;
export type CourierCommand = z.infer<typeof courierCommandSchema>;
export type CourierResolution = z.infer<typeof courierResolutionSchema>;
export type CourierResult = z.infer<typeof courierResultSchema>;
export type CourierCommandResponse = z.infer<typeof courierCommandResponseSchema>;
export type CourierResolutionResponse = z.infer<typeof courierResolutionResponseSchema>;
