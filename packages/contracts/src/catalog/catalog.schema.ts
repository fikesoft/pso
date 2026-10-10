import { catalogSearchFields } from './catalog-search.schema';
import { z } from 'zod';
import { idSchema, operationsQuerySchema, priceSchema, versionSchema } from '../shared';
import { productTaxRateSchema } from './tax.schema';
import { productInformationSchema } from './product-information.schema';

export const catalogQuerySchema = operationsQuerySchema
  .extend({
    ...catalogSearchFields,
    includeArchived: z
      .enum(['true', 'false'])
      .transform((value) => value === 'true')
      .optional(),
  })
  .strict();
export const catalogProductQuerySchema = z.object({ locationId: idSchema }).strict();
export const catalogStatusSchema = z.enum(['ACTIVE', 'ARCHIVED']);
export const categorySortOrderSchema = z.number().int().min(0).max(100_000);
export const createCategorySchema = z
  .object({
    name: z.string().trim().min(1).max(100),
    sortOrder: categorySortOrderSchema.optional(),
  })
  .strict();
export const updateCategorySchema = z
  .object({
    version: versionSchema,
    name: z.string().trim().min(1).max(100).optional(),
    status: catalogStatusSchema.optional(),
    sortOrder: categorySortOrderSchema.optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 1, 'Selectați cel puțin o modificare.');
export const createProductSchema = z
  .object({
    locationId: idSchema,
    categoryId: idSchema.optional(),
    name: z.string().trim().min(1).max(150),
    sku: z.string().trim().min(1).max(60),
    description: z.string().trim().max(1000).optional(),
    price: priceSchema,
    taxRate: productTaxRateSchema.nullable().optional(),
    ...productInformationSchema.shape,
  })
  .strict();
export const updateProductSchema = z
  .object({
    version: versionSchema,
    name: z.string().trim().min(1).max(150).optional(),
    sku: z.string().trim().min(1).max(60).optional(),
    description: z.string().trim().max(1000).optional(),
    categoryId: idSchema.nullable().optional(),
    status: catalogStatusSchema.optional(),
    taxRate: productTaxRateSchema.nullable().optional(),
    ...productInformationSchema.shape,
  })
  .strict()
  .refine((value) => Object.keys(value).length > 1, 'Selectați cel puțin o modificare.');
export const locationProductSchema = z
  .object({
    price: priceSchema,
    enabled: z.boolean(),
    version: versionSchema.optional(),
  })
  .strict();
