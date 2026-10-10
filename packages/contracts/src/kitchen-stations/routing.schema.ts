import { z } from 'zod';
import { idSchema } from '../shared/validation';
export const kitchenRoutingIdentitySchema = z
  .object({ locationId: idSchema, productId: idSchema, requestKey: idSchema })
  .strict();
export const kitchenRoutingSetSchema = kitchenRoutingIdentitySchema
  .extend({ version: z.number().int().min(0).max(2147483646), stationId: idSchema.nullable() })
  .strict();
export const kitchenRoutingReadSchema = z
  .object({ locationId: idSchema, productId: idSchema })
  .strict();
export const kitchenRoutingProductsSchema = z
  .object({
    locationId: idSchema,
    cursor: idSchema.optional(),
    limit: z.coerce.number().int().min(1).max(100).default(50),
    search: z.string().trim().max(80).default(''),
  })
  .strict();
