import { z } from 'zod';
import { idSchema, versionSchema } from '../shared/validation';
import { courierWorkItemSchema } from './courier-work.schema';
export const courierAcceptanceResolutionSchema = z
  .object({
    locationId: idSchema,
    assignmentId: idSchema,
    requestKey: idSchema,
  })
  .strict();
export const courierAcceptanceSchema = courierAcceptanceResolutionSchema
  .extend({
    orderVersion: versionSchema,
    confirmed: z.literal(true),
  })
  .strict();
export const courierAcceptanceResultSchema = courierAcceptanceResolutionSchema
  .extend({
    id: idSchema,
    orderId: idSchema,
    courierUserId: idSchema,
    orderVersion: versionSchema,
    acceptedAt: z.iso.datetime(),
  })
  .strict();
export const courierAcceptanceResponseSchema = z
  .object({
    result: courierAcceptanceResultSchema,
    order: courierWorkItemSchema,
  })
  .strict()
  .refine(
    (value) =>
      value.result.orderId === value.order.orderId &&
      value.result.locationId === value.order.locationId &&
      value.result.courierUserId === value.order.courierUserId &&
      value.result.orderVersion <= value.order.orderVersion,
    'Acceptarea nu corespunde livrării.',
  );
export const courierAcceptanceResolutionResponseSchema = z.union([
  z
    .object({
      status: z.literal('SUCCEEDED'),
      result: courierAcceptanceResultSchema,
      order: courierWorkItemSchema,
    })
    .strict(),
  courierAcceptanceResolutionSchema
    .extend({ status: z.literal('RETIRED'), orderId: idSchema })
    .strict(),
]);
