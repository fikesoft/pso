import { z } from 'zod';
import { checkoutMoneySchema } from '../checkout';
import { idSchema, operationsQuerySchema, versionSchema } from '../shared';
import { websiteDeliveryOrderSchema } from './website-delivery.schema';

export const websiteIntegrationOrderSchema = websiteDeliveryOrderSchema
  .extend({ expectedTotal: checkoutMoneySchema })
  .strict();
export const websiteConnectionStatusSchema = z.enum(['ACTIVE', 'PAUSED']);
export const websiteOrderStatusSchema = z.enum(['AWAITING_ACCEPTANCE', 'ACCEPTED', 'REJECTED']);
export const createWebsiteConnectionSchema = z
  .object({ locationId: idSchema, name: z.string().trim().min(1).max(100) })
  .strict();
export const updateWebsiteConnectionSchema = z
  .object({
    version: versionSchema,
    name: z.string().trim().min(1).max(100).optional(),
    status: websiteConnectionStatusSchema.optional(),
  })
  .strict()
  .refine((body) => Object.keys(body).length > 1, 'Selectați cel puțin o modificare.');
export const createWebsiteKeySchema = z
  .object({
    name: z.string().trim().min(1).max(100),
    expiresInDays: z.number().int().min(1).max(90).default(30),
  })
  .strict();
export const websiteCatalogQuerySchema = operationsQuerySchema.omit({ locationId: true }).strict();
export const websiteInboxQuerySchema = operationsQuerySchema
  .extend({ status: websiteOrderStatusSchema.optional() })
  .strict();
export const websiteExternalOrderQuerySchema = z
  .object({ externalOrderId: z.string().trim().min(1).max(100) })
  .strict();
export const acceptWebsiteOrderSchema = z.object({ version: versionSchema }).strict();
export const rejectWebsiteOrderSchema = z
  .object({ version: versionSchema, reason: z.string().trim().min(3).max(500) })
  .strict();
export const websitePrivateDataSchema = websiteDeliveryOrderSchema
  .pick({ customer: true, delivery: true, paymentMethod: true })
  .strict();
