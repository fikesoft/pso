import { z } from 'zod';
import { idSchema } from './identity.schema';

export const priceSchema = z.string().regex(/^(?:0|[1-9]\d{0,7})(?:\.\d{1,4})?$/);
export const quantitySchema = z
  .string()
  .regex(/^(?:0|[1-9]\d{0,3})(?:\.\d{1,3})?$/)
  .refine((value) => /[1-9]/.test(value), 'Cantitatea trebuie să fie pozitivă.');
export const versionSchema = z.number().int().positive();
export const operationsQuerySchema = z.object({
  locationId: idSchema,
  cursor: idSchema.optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});
