import { z } from 'zod';
import { customerNameSchema, customerPhoneSchema } from '../shared/model/customer.schema';
import { idSchema } from '../shared/model/identity.schema';
import {
  CUSTOMER_MANAGEMENT_ACTIONS,
  CUSTOMER_MANAGEMENT_FILTERS,
} from './config/customer-management.constants';

const versionSchema = z.number().int().min(1).max(2147483646);
export const customerEmailSchema = z.string().trim().max(254).email().nullable();
export const customerManagementProfileSchema = z
  .object({
    name: customerNameSchema.nullable(),
    phone: customerPhoneSchema.refine((value) => !!value, 'Numărul de telefon este obligatoriu.'),
    email: customerEmailSchema,
  })
  .strict();
const command = z.object({
  locationId: idSchema,
  version: versionSchema,
  requestKey: idSchema,
});
export const customerManagementCommandSchema = z.discriminatedUnion('action', [
  command
    .extend({ action: z.literal('UPDATE'), profile: customerManagementProfileSchema })
    .strict(),
  command.extend({ action: z.literal('ARCHIVE') }).strict(),
  command.extend({ action: z.literal('RESTORE') }).strict(),
]);
export const customerManagementResolutionSchema = z
  .object({
    locationId: idSchema,
    requestKey: idSchema,
    action: z.enum(CUSTOMER_MANAGEMENT_ACTIONS),
  })
  .strict();
export const customerManagementListSchema = z
  .object({
    locationId: idSchema,
    status: z.enum(CUSTOMER_MANAGEMENT_FILTERS).default('ACTIVE'),
    cursor: z.string().min(1).max(2048).optional(),
    limit: z.coerce.number().int().min(1).max(100).default(50),
  })
  .strict();
export const customerManagementSearchSchema = customerManagementListSchema
  .extend({
    field: z.enum(['PHONE', 'NAME']),
    query: z.string().trim().min(1).max(160),
  })
  .strict()
  .superRefine((value, context) => {
    if (value.field === 'PHONE' && !customerPhoneSchema.safeParse(value.query).success)
      context.addIssue({ code: 'custom', path: ['query'], message: 'Telefon invalid.' });
  });
export const customerManagementResultSchema = z
  .object({
    customerId: idSchema,
    requestKey: idSchema,
    action: z.enum(CUSTOMER_MANAGEMENT_ACTIONS),
    expectedVersion: versionSchema,
    version: z.number().int().min(2).max(2147483647),
    status: z.enum(['ACTIVE', 'ARCHIVED']),
    occurredAt: z.iso.datetime({ offset: true }),
  })
  .strict()
  .refine((value) => value.version === value.expectedVersion + 1, {
    message: 'Versiunea rezultatului nu corespunde operației.',
  })
  .refine((value) => value.status === (value.action === 'ARCHIVE' ? 'ARCHIVED' : 'ACTIVE'), {
    message: 'Starea rezultatului nu corespunde operației.',
  });

export const customerManagementDtoSchema = customerManagementProfileSchema.extend({
  id: idSchema,
  version: z.number().int().min(1).max(2147483647),
  status: z.enum(['ACTIVE', 'ARCHIVED']),
  createdAt: z.iso.datetime({ offset: true }),
  updatedAt: z.iso.datetime({ offset: true }),
});
export const customerManagementListResponseSchema = z
  .object({
    customers: z.array(customerManagementDtoSchema),
    nextCursor: z.string().min(1).max(2048).nullable(),
  })
  .strict();
export const customerManagementCommandResponseSchema = z.discriminatedUnion('status', [
  z
    .object({
      status: z.literal('SUCCEEDED'),
      result: customerManagementResultSchema,
      customer: customerManagementDtoSchema,
    })
    .strict(),
  z
    .object({
      status: z.literal('RETIRED'),
      result: z.null(),
      customer: customerManagementDtoSchema,
    })
    .strict(),
]);
