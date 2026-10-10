import { z } from 'zod';
import { companySlugSchema, loginSchema, passwordSchema, staffPinSchema } from '../shared';
export const loginRequestSchema = z
  .object({
    companySlug: companySlugSchema,
    login: loginSchema,
    password: z.string().min(1).max(128),
  })
  .strict();
export const platformLoginRequestSchema = loginRequestSchema.omit({ companySlug: true });
export const pinLoginSchema = z
  .object({ companySlug: companySlugSchema, pin: staffPinSchema })
  .strict();
export const changePasswordSchema = z
  .object({ currentPassword: z.string().min(1).max(128), newPassword: passwordSchema })
  .strict();
export const mfaVerifySchema = z
  .object({ code: z.string().regex(/^\d{6}$/, 'Introduceți codul de 6 cifre.') })
  .strict();
export const emptyRequestSchema = z.object({}).strict();
