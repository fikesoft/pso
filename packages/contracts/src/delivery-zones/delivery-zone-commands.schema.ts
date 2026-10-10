import { z } from 'zod';
import { idSchema } from '../shared/model/identity.schema';
import { deliveryZoneProfileSchema } from './delivery-zones.schema';
import { DELIVERY_ZONE_ACTIONS } from './config/delivery-zones.constants';

const version = z.number().int().min(1).max(2147483646);
const context = z.object({ locationId: idSchema, requestKey: idSchema });
export const deliveryZoneCommandSchema = z.discriminatedUnion('action', [
  context.extend({ action: z.literal('CREATE'), profile: deliveryZoneProfileSchema }).strict(),
  context
    .extend({ action: z.literal('UPDATE'), version, profile: deliveryZoneProfileSchema })
    .strict(),
  context.extend({ action: z.literal('ARCHIVE'), version }).strict(),
  context.extend({ action: z.literal('RESTORE'), version }).strict(),
]);
export const deliveryZoneResolutionSchema = context
  .extend({ action: z.enum(DELIVERY_ZONE_ACTIONS) })
  .strict();
export const deliveryZoneSchema = z
  .object({
    id: idSchema,
    locationId: idSchema,
    version: z.number().int().min(1).max(2147483647),
    status: z.enum(['ACTIVE', 'ARCHIVED']),
    profile: deliveryZoneProfileSchema,
    createdAt: z.iso.datetime(),
    updatedAt: z.iso.datetime(),
  })
  .strict();
export const deliveryZoneListResponseSchema = z
  .object({
    zones: z.array(deliveryZoneSchema).max(100),
    nextCursor: z.string().min(1).max(2048).nullable(),
  })
  .strict();
export const deliveryZoneResultSchema = z
  .object({
    requestKey: idSchema,
    action: z.enum(DELIVERY_ZONE_ACTIONS),
    zoneId: idSchema,
    locationId: idSchema,
    version: z.number().int().min(1).max(2147483647),
    status: z.enum(['ACTIVE', 'ARCHIVED']),
    occurredAt: z.iso.datetime(),
  })
  .strict();
export const deliveryZoneCommandResponseSchema = z
  .object({
    result: deliveryZoneResultSchema,
    zone: deliveryZoneSchema,
  })
  .strict()
  .refine(
    (response) =>
      response.result.zoneId === response.zone.id &&
      response.result.locationId === response.zone.locationId &&
      response.result.version <= response.zone.version,
    'Rezultatul istoric și zona curentă trebuie să aparțină aceluiași context.',
  );
export const deliveryZoneResolutionResponseSchema = z.discriminatedUnion('status', [
  z
    .object({
      status: z.literal('SUCCEEDED'),
      result: deliveryZoneResultSchema,
      zone: deliveryZoneSchema,
    })
    .strict(),
  z
    .object({
      status: z.literal('RETIRED'),
      requestKey: idSchema,
      action: z.enum(DELIVERY_ZONE_ACTIONS),
      zoneId: idSchema,
      locationId: idSchema,
    })
    .strict(),
]);
