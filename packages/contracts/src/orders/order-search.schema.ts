import { z } from 'zod';
import { idSchema } from '../shared';
import { ORDER_SOURCES, ORDER_STATUSES } from './config/order.constants';
import { orderCustomerNameSchema, orderCustomerPhoneSchema } from './order-customer.schema';

const calendarDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((value) => {
    const date = new Date(`${value}T00:00:00.000Z`);
    return (
      !value.startsWith('0000-') &&
      Number.isFinite(date.getTime()) &&
      date.toISOString().slice(0, 10) === value
    );
  }, 'Data nu este validă.');
export const orderSearchSchema = z
  .object({
    locationId: idSchema,
    number: z.number().int().positive().max(2_147_483_647).optional(),
    customerName: orderCustomerNameSchema.min(1).optional(),
    customerPhone: orderCustomerPhoneSchema.transform((value) => value || undefined).optional(),
    createdByUserId: idSchema.optional(),
    status: z.enum(ORDER_STATUSES).optional(),
    source: z.enum([...ORDER_SOURCES, 'UNKNOWN']).optional(),
    createdFrom: calendarDateSchema.optional(),
    createdTo: calendarDateSchema.optional(),
    cursor: z.string().min(1).max(2048).optional(),
    limit: z.number().int().min(1).max(100).default(50),
  })
  .strict()
  .refine(
    (value) => !value.createdFrom || !value.createdTo || value.createdFrom <= value.createdTo,
    {
      message: 'Intervalul de date nu este valid.',
      path: ['createdTo'],
    },
  );
