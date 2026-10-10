import { z } from 'zod';
import { idSchema } from '../shared';

export const realtimeSubscriptionSchema = z
  .object({
    type: z.literal('subscribe'),
    locationId: idSchema,
    topic: z.enum(['catalog', 'orders', 'kitchen']),
  })
  .strict();

export const catalogNotificationSchema = z
  .object({
    organizationId: idSchema,
    locationId: idSchema.nullable(),
  })
  .strict();

export const orderNotificationSchema = z
  .object({
    eventId: idSchema,
    organizationId: idSchema,
    locationId: idSchema,
  })
  .strict();
export const kitchenNotificationSchema = z
  .object({
    organizationId: idSchema,
    locationId: idSchema,
  })
  .strict();
