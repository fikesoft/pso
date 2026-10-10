import type { z } from 'zod';
import type {
  deliveryZoneProfileSchema,
  deliveryZoneShapeSchema,
  deliveryZoneListSchema,
} from './delivery-zones.schema';
export type DeliveryZoneProfile = z.infer<typeof deliveryZoneProfileSchema>;
export type DeliveryZoneShape = z.infer<typeof deliveryZoneShapeSchema>;
export type DeliveryZoneListQuery = z.infer<typeof deliveryZoneListSchema>;

import type {
  deliveryZoneCommandSchema,
  deliveryZoneResolutionSchema,
  deliveryZoneSchema,
  deliveryZoneCommandResponseSchema,
  deliveryZoneResolutionResponseSchema,
  deliveryZoneListResponseSchema,
} from './delivery-zone-commands.schema';
export type DeliveryZoneCommand = z.infer<typeof deliveryZoneCommandSchema>;
export type DeliveryZoneResolution = z.infer<typeof deliveryZoneResolutionSchema>;
export type DeliveryZone = z.infer<typeof deliveryZoneSchema>;
export type DeliveryZoneCommandResponse = z.infer<typeof deliveryZoneCommandResponseSchema>;
export type DeliveryZoneResolutionResponse = z.infer<typeof deliveryZoneResolutionResponseSchema>;
export type DeliveryZoneListResponse = z.infer<typeof deliveryZoneListResponseSchema>;
import type {
  deliveryFeePreviewSchema,
  deliveryFeePreviewResponseSchema,
} from './delivery-fee.schema';
export type DeliveryFeePreview = z.infer<typeof deliveryFeePreviewSchema>;
export type DeliveryFeePreviewResponse = z.infer<typeof deliveryFeePreviewResponseSchema>;
