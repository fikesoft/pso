import { z } from 'zod';
import { customerNameSchema, customerPhoneSchema } from '../shared/model/customer.schema';
export {
  customerNameSchema as orderCustomerNameSchema,
  customerPhoneSchema as orderCustomerPhoneSchema,
} from '../shared/model/customer.schema';
export const orderCustomerSchema = z
  .object({
    name: customerNameSchema.nullable().optional(),
    phone: customerPhoneSchema.nullable().optional(),
  })
  .strict();
