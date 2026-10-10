import { z } from 'zod';
import { idSchema, versionSchema, moneySchema } from '../shared/validation';
import { deliveryAddressSchema } from '../shared/model/address.schema';
import { orderCustomerSchema } from '../orders/order-customer.schema';
import { KITCHEN_STATUSES } from '../orders/config/order.constants';
import { PACKING_SESSION_STATUSES } from '../packing/config/packing.constants';
import {
  COURIER_WORK_VIEWS,
  COURIER_WORK_ACTIVE_STATUSES,
  COURIER_WORK_HISTORY_STATUSES,
  COURIER_WORK_LIMITS,
} from './config/courier-work.constants';

export const courierWorkQuerySchema = z
  .object({
    locationId: idSchema,
    view: z.enum(COURIER_WORK_VIEWS).default('ACTIVE'),
    limit: z.coerce
      .number()
      .int()
      .min(1)
      .max(COURIER_WORK_LIMITS.maximumPage)
      .default(COURIER_WORK_LIMITS.page),
    cursor: z.string().min(1).max(2048).optional(),
  })
  .strict();
export const courierWorkDetailQuerySchema = z.object({ locationId: idSchema }).strict();
export const courierWorkItemSchema = z
  .object({
    orderId: idSchema,
    locationId: idSchema,
    orderVersion: versionSchema,
    assignmentId: idSchema,
    courierUserId: idSchema,
    number: z.number().int().positive(),
    deliveryStatus: z.enum([...COURIER_WORK_ACTIVE_STATUSES, ...COURIER_WORK_HISTORY_STATUSES]),
    kitchenStatus: z.enum(['NOT_SENT', ...KITCHEN_STATUSES]),
    packingStatus: z.enum(['NOT_REQUIRED', ...PACKING_SESSION_STATUSES]),
    customer: orderCustomerSchema.nullable(),
    deliveryAddress: deliveryAddressSchema.nullable(),
    notes: z.string().max(2000).nullable(),
    total: moneySchema,
    outstandingAmount: moneySchema,
    currency: z.literal('MDL'),
    assignedAt: z.iso.datetime(),
    acceptedAt: z.iso.datetime().nullable(),
    deliveryProof: z
      .object({ recipientName: z.string().min(2).max(120), confirmedAt: z.iso.datetime() })
      .strict()
      .nullable(),
    updatedAt: z.iso.datetime(),
  })
  .strict();
export const courierWorkListResponseSchema = z
  .object({
    locationId: idSchema,
    courierUserId: idSchema,
    view: z.enum(COURIER_WORK_VIEWS),
    orders: z.array(courierWorkItemSchema).max(COURIER_WORK_LIMITS.maximumPage),
    nextCursor: z.string().min(1).max(2048).nullable(),
  })
  .strict()
  .superRefine((value, ctx) => {
    const states: readonly string[] =
      value.view === 'ACTIVE' ? COURIER_WORK_ACTIVE_STATUSES : COURIER_WORK_HISTORY_STATUSES;
    const ids = new Set<string>();
    for (const order of value.orders) {
      if (
        order.locationId !== value.locationId ||
        order.courierUserId !== value.courierUserId ||
        !states.includes(order.deliveryStatus) ||
        ids.has(order.orderId)
      )
        ctx.addIssue({ code: 'custom', message: 'Livrările nu corespund contextului curierului.' });
      ids.add(order.orderId);
    }
  });
