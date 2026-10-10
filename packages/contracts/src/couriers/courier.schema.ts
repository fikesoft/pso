import { z } from 'zod';
import { idSchema } from '../shared/model/identity.schema';
import {
  COURIER_VEHICLES,
  COURIER_AVAILABILITY,
  COURIER_PROFILE_STATUSES,
  COURIER_EFFECTIVE_STATUSES,
  COURIER_LIMITS,
} from './config/courier.constants';
export const courierProfileSchema = z
  .object({
    vehicle: z.enum(COURIER_VEHICLES),
    capacity: z.number().int().min(1).max(COURIER_LIMITS.capacity),
  })
  .strict();
export const courierSchema = z
  .object({
    id: idSchema,
    locationId: idSchema,
    userId: idSchema,
    displayName: z.string().min(1),
    profile: courierProfileSchema,
    version: z.number().int().positive().max(2147483647),
    status: z.enum(COURIER_PROFILE_STATUSES),
    availability: z.enum(COURIER_AVAILABILITY),
    effectiveStatus: z.enum(COURIER_EFFECTIVE_STATUSES),
    activeDeliveries: z.number().int().nonnegative(),
    createdAt: z.iso.datetime(),
    updatedAt: z.iso.datetime(),
  })
  .strict();
export const courierQuerySchema = z
  .object({
    locationId: idSchema,
    status: z.enum(['ACTIVE', 'ARCHIVED', 'ALL']).default('ACTIVE'),
    limit: z.coerce
      .number()
      .int()
      .min(1)
      .max(COURIER_LIMITS.maxPageSize)
      .default(COURIER_LIMITS.pageSize),
    cursor: z.string().min(1).max(2048).optional(),
  })
  .strict();
export const courierListResponseSchema = z
  .object({
    couriers: z.array(courierSchema).max(COURIER_LIMITS.maxPageSize),
    nextCursor: z.string().min(1).max(2048).nullable(),
  })
  .strict();
export const courierCandidateQuerySchema = courierQuerySchema.omit({ status: true });
export const courierCandidateResponseSchema = z
  .object({
    candidates: z
      .array(z.object({ userId: idSchema, displayName: z.string().min(1) }).strict())
      .max(COURIER_LIMITS.maxPageSize),
    nextCursor: z.string().min(1).max(2048).nullable(),
  })
  .strict();
