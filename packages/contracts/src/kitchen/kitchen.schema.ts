import { z } from 'zod';
import { operationsQuerySchema, versionSchema, idSchema } from '../shared';
import { KITCHEN_STATUSES } from '../orders/config/order.constants';

export const kitchenStatusSchema = z.enum(KITCHEN_STATUSES);
export const kitchenArrivalQuerySchema = z
  .object({
    locationId: idSchema,
    stationId: z.union([idSchema, z.literal('UNASSIGNED')]).optional(),
  })
  .strict();
export const kitchenQuerySchema = operationsQuerySchema
  .extend({
    status: kitchenStatusSchema.optional(),
    stationId: z.union([idSchema, z.literal('UNASSIGNED')]).optional(),
  })
  .strict();
export const updateKitchenTicketSchema = z
  .object({
    version: versionSchema,
    status: z.enum(['PREPARING', 'PARTIALLY_READY', 'READY']),
  })
  .strict();
