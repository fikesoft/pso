import { z } from 'zod';
export const passwordSchema = z.string().min(12, 'Minimum 12 caractere').max(128);

export const authenticationLoginSchema = z
  .object({
    companySlug: z.string().max(80).optional(),
    login: z.string().min(1).max(80),
    password: z.string().min(1).max(128),
  })
  .strict();

export const authenticationPasswordSchema = z
  .object({ currentPassword: z.string().max(128), newPassword: passwordSchema })
  .strict();

export const authenticationMfaSchema = z.object({ code: z.string().regex(/^\d{6}$/) }).strict();
