import { z } from 'zod';
import { idSchema, versionSchema } from '../shared/validation';
import { DELIVERY_STATUSES } from './config/delivery.constants';
export const deliveryResolutionSchema = z
  .object({
    locationId: idSchema,
    requestKey: idSchema,
    status: z.enum([
      'WAITING_COURIER',
      'ASSIGNED',
      'PICKED_UP',
      'DELIVERING',
      'DELIVERED',
      'FAILED',
    ]),
  })
  .strict();
export const deliveryOperationRecordSchema = z
  .object({
    id: idSchema,
    fromStatus: z.enum(DELIVERY_STATUSES).nullable(),
    toStatus: z.enum(DELIVERY_STATUSES),
    previousCourierId: idSchema.nullable(),
    courierUserId: idSchema.nullable(),
    courierName: z.string().nullable(),
    actorUserId: idSchema,
    reason: z.string().nullable(),
    orderVersion: versionSchema,
    createdAt: z.iso.datetime(),
  })
  .strict();
export const deliveryResolutionResponseSchema = z.discriminatedUnion('status', [
  z
    .object({
      status: z.literal('SUCCEEDED'),
      locationId: idSchema,
      orderId: idSchema,
      requestKey: idSchema,
      operation: deliveryOperationRecordSchema,
    })
    .strict(),
  z
    .object({
      status: z.literal('RETIRED'),
      locationId: idSchema,
      orderId: idSchema,
      requestKey: idSchema,
      toStatus: deliveryResolutionSchema.shape.status,
    })
    .strict(),
]);
