import { z } from 'zod';
import { idSchema } from './identity.schema';
import { versionSchema } from './operations.schema';
export const deliveryAddressSchema = z
  .object({
    address: z.string().trim().min(1).max(500),
    instructions: z.string().trim().max(500).nullable().optional(),
  })
  .strict();
export const addressRefSchema = z.object({ id: idSchema, version: versionSchema }).strict();
