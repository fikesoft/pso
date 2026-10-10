import { z } from 'zod';
export const provisioningSchema = z
  .object({
    slug: z
      .string()
      .min(3)
      .max(50)
      .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
    name: z.string().trim().min(2).max(100),
    legalName: z.string().max(160).optional(),
    adminLogin: z
      .string()
      .min(3)
      .max(64)
      .transform((x) => x.normalize('NFKC').trim().toLowerCase())
      .refine((x) => /^[a-z0-9._-]+$/.test(x)),
    adminDisplayName: z.string().min(2).max(100),
    password: z.string().min(12).max(128).optional(),
  })
  .strict();
