import { z } from 'zod';
import { idSchema } from '../shared/model/identity.schema';
import { moneySchema } from '../shared/model/money.schema';
import { deliveryCoordinateSchema } from './delivery-zones.schema';
export const deliveryFeePreviewSchema = z
  .object({
    locationId: idSchema,
    destination: deliveryCoordinateSchema,
    subtotal: moneySchema,
  })
  .strict();
export const deliveryFeePreviewResponseSchema = z
  .object({
    locationId: idSchema,
    asOf: z.iso.datetime(),
    timezone: z.string().min(1).max(100),
    result: z.discriminatedUnion('status', [
      z.object({ status: z.enum(['NOT_CONFIGURED', 'OUTSIDE_ZONE', 'CLOSED']) }).strict(),
      z
        .object({
          status: z.literal('MINIMUM_NOT_MET'),
          zoneId: idSchema,
          zoneVersion: z.number().int().positive(),
          minimumOrder: moneySchema,
        })
        .strict(),
      z
        .object({
          status: z.literal('AVAILABLE'),
          zoneId: idSchema,
          zoneVersion: z.number().int().positive(),
          zoneName: z.string(),
          subtotal: moneySchema,
          fee: moneySchema,
          total: moneySchema,
          estimatedMinutes: z.number().int().positive(),
        })
        .strict(),
    ]),
  })
  .strict();
