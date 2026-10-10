import { z } from 'zod';
import { companySlugSchema, loginSchema, passwordSchema } from '../shared';
export const createOrganizationSchema = z
  .object({
    slug: companySlugSchema,
    name: z.string().trim().min(2).max(120),
    legalName: z.string().trim().max(250).optional(),
    adminLogin: loginSchema,
    adminDisplayName: z.string().trim().min(2).max(100),
    password: passwordSchema.optional(),
  })
  .strict();
