import { z } from 'zod';
import { idSchema } from '../shared';
// Public responses deliberately enumerate safe fields. Identity persistence models
// and credential/session hashes must never be used as response DTOs.
export const publicUserSchema = z
  .object({
    id: idSchema,
    organizationId: idSchema,
    login: z.string(),
    displayName: z.string(),
    isPrimaryAdmin: z.boolean(),
    mustChangePassword: z.boolean(),
    mfaRequired: z.boolean(),
    mfaEnrolled: z.boolean(),
    authenticationMethod: z.enum(['PASSWORD', 'PIN']).optional(),
    status: z.enum(['ACTIVE', 'DISABLED', 'PENDING']).optional(),
    locationIds: z.array(idSchema).optional(),
    version: z.number().int().optional(),
  })
  .strict();
export const organizationSchema = z
  .object({
    id: idSchema,
    name: z.string(),
    slug: z.string(),
    currency: z.literal('MDL').optional(),
    locale: z.string().optional(),
    timezone: z.string().optional(),
    status: z.enum(['DRAFT', 'ACTIVE', 'DISABLED']).optional(),
  })
  .strict();
export const sessionResponseSchema = z
  .object({
    user: publicUserSchema.nullable(),
    organization: organizationSchema.optional(),
    csrfToken: z.string(),
    stage: z.enum(['password', 'enroll', 'mfa', 'ready']).optional(),
  })
  .strict();
export const auditEventSchema = z
  .object({
    id: idSchema,
    action: z.string(),
    targetId: z.string().nullable(),
    createdAt: z.string(),
    outcome: z.string(),
    actorLabel: z.string().optional(),
  })
  .strict();
export const errorResponseSchema = z
  .object({ error: z.string(), code: z.string().optional() })
  .strict();
