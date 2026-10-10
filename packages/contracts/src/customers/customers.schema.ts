import { z } from 'zod';
import { customerEmailSchema } from './customer-management.schema';
import { customerNameSchema, customerPhoneSchema, idSchema } from '../shared';
export const customerLookupSchema = z
  .object({
    locationId: idSchema,
    phone: customerPhoneSchema.refine((value) => !!value, 'Numărul de telefon este obligatoriu.'),
  })
  .strict();
export const createCustomerSchema = customerLookupSchema
  .extend({
    requestKey: idSchema,
    name: customerNameSchema.nullable().optional(),
    email: customerEmailSchema.optional(),
  })
  .strict();
