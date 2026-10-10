import { z } from 'zod';
import { idSchema } from '../shared/model/identity.schema';
import { moneySchema } from '../shared/model/money.schema';
import { deliveryCoordinateSchema } from './delivery-zones.schema';
import { deliveryFeePreviewResponseSchema } from './delivery-fee.schema';
export const orderDeliveryFeePreviewResponseSchema = deliveryFeePreviewResponseSchema
  .extend({
    orderId: idSchema,
    version: z.number().int().positive(),
  })
  .strict();
export const deliveryDestinationSchema = deliveryCoordinateSchema.refine(
  (point) => [point.latitude, point.longitude].every((value) => Number(value.toFixed(6)) === value),
  'Coordonatele destinației acceptă cel mult șase zecimale.',
);
export const orderDeliveryFeePreviewSchema = z
  .object({
    version: z.number().int().positive().max(2147483646),
    destination: deliveryDestinationSchema,
  })
  .strict();
export const orderDeliveryFeeCommandSchema = orderDeliveryFeePreviewSchema
  .extend({
    requestKey: idSchema,
    zoneId: idSchema,
    zoneVersion: z.number().int().positive(),
    subtotal: moneySchema,
    fee: moneySchema,
    total: moneySchema,
    confirmed: z.literal(true),
  })
  .strict();
export const orderDeliveryFeeResolutionSchema = z.object({ requestKey: idSchema }).strict();
