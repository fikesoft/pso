import { z } from 'zod';
import { idSchema } from '../shared';
const brandNameSchema = z.string().trim().min(2).max(100);
const brandCodeSchema = z
  .string()
  .trim()
  .toUpperCase()
  .min(2)
  .max(30)
  .regex(/^[A-Z0-9_-]+$/);
export const brandSchema = z
  .object({
    id: idSchema,
    organizationId: idSchema,
    name: brandNameSchema,
    code: brandCodeSchema,
    status: z.enum(['ACTIVE', 'DISABLED']),
    version: z.number().int().positive(),
  })
  .strict();
export const createBrandSchema = z
  .object({ name: brandNameSchema, code: brandCodeSchema })
  .strict();
export const updateBrandSchema = z
  .object({
    name: brandNameSchema.optional(),
    status: z.enum(['ACTIVE', 'DISABLED']).optional(),
    version: z.number().int().positive(),
  })
  .strict();
