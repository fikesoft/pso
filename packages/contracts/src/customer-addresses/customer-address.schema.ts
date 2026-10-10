import { z } from 'zod';
import { deliveryAddressSchema, idSchema, versionSchema } from '../shared';
export const customerAddressQuerySchema = z
  .object({
    locationId: idSchema,
    limit: z.coerce.number().int().min(1).max(100).default(50),
    cursor: z.string().min(1).max(2048).optional(),
  })
  .strict();
export const customerAddressCreateSchema = deliveryAddressSchema
  .extend({
    label: z.string().trim().max(80).nullable().optional(),
    locationId: idSchema,
    requestKey: idSchema,
  })
  .strict();
export const customerAddressArchiveSchema = z
  .object({ locationId: idSchema, version: versionSchema, requestKey: idSchema })
  .strict();
export const customerAddressCreationResolutionSchema = z
  .object({ locationId: idSchema, requestKey: idSchema })
  .strict();
