import { z } from 'zod';
import { idSchema } from '../shared/model/identity.schema';
import { courierProfileSchema, courierSchema } from './courier.schema';
import {
  COURIER_ACTIONS,
  COURIER_AVAILABILITY,
  COURIER_PROFILE_STATUSES,
} from './config/courier.constants';
const version = z.number().int().positive().max(2147483646);
const context = z.object({ locationId: idSchema, requestKey: idSchema });
export const courierCommandSchema = z.discriminatedUnion('action', [
  context
    .extend({ action: z.literal('CREATE'), userId: idSchema, profile: courierProfileSchema })
    .strict(),
  context.extend({ action: z.literal('UPDATE'), version, profile: courierProfileSchema }).strict(),
  context
    .extend({
      action: z.literal('SET_AVAILABILITY'),
      version,
      availability: z.enum(COURIER_AVAILABILITY),
    })
    .strict(),
  context.extend({ action: z.literal('ARCHIVE'), version }).strict(),
  context.extend({ action: z.literal('RESTORE'), version }).strict(),
]);
export const courierResolutionSchema = context.extend({ action: z.enum(COURIER_ACTIONS) }).strict();
export const courierResultSchema = z
  .object({
    requestKey: idSchema,
    action: z.enum(COURIER_ACTIONS),
    courierId: idSchema,
    locationId: idSchema,
    userId: idSchema,
    version: z.number().int().positive().max(2147483647),
    status: z.enum(COURIER_PROFILE_STATUSES),
    availability: z.enum(COURIER_AVAILABILITY),
    occurredAt: z.iso.datetime(),
  })
  .strict();
export const courierCommandResponseSchema = z
  .object({
    result: courierResultSchema,
    courier: courierSchema,
  })
  .strict()
  .refine(
    (value) =>
      value.result.courierId === value.courier.id &&
      value.result.locationId === value.courier.locationId &&
      value.result.userId === value.courier.userId &&
      value.result.version <= value.courier.version,
    'Rezultatul și profilul curent trebuie să aparțină aceluiași curier.',
  );
export const courierResolutionResponseSchema = z.discriminatedUnion('status', [
  z
    .object({ status: z.literal('SUCCEEDED'), result: courierResultSchema, courier: courierSchema })
    .strict(),
  context
    .extend({ status: z.literal('RETIRED'), courierId: idSchema, action: z.enum(COURIER_ACTIONS) })
    .strict(),
]);
