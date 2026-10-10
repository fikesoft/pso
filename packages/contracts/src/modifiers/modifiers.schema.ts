import { z } from 'zod';
import {
  MAX_GROUP_SELECTIONS,
  idSchema,
  operationsQuerySchema,
  priceSchema,
  versionSchema,
} from '../shared';

export const modifierStatusSchema = z.enum(['ACTIVE', 'ARCHIVED']);
export const modifierSortOrderSchema = z.number().int().min(0).max(100_000);
export const modifierGroupQuerySchema = operationsQuerySchema
  .extend({
    includeArchived: z
      .enum(['true', 'false'])
      .transform((value) => value === 'true')
      .optional(),
  })
  .strict();
export const modifierDetailQuerySchema = modifierGroupQuerySchema.omit({
  cursor: true,
  limit: true,
});
export const createModifierGroupSchema = z
  .object({
    name: z.string().trim().min(1).max(100),
    minSelections: z.number().int().min(0).max(MAX_GROUP_SELECTIONS),
    maxSelections: z.number().int().min(1).max(MAX_GROUP_SELECTIONS),
    sortOrder: modifierSortOrderSchema.optional(),
  })
  .strict()
  .refine((value) => value.minSelections <= value.maxSelections, {
    message: 'Numărul minim depășește maximul.',
    path: ['minSelections'],
  });
export const updateModifierGroupSchema = z
  .object({
    version: versionSchema,
    name: z.string().trim().min(1).max(100).optional(),
    minSelections: z.number().int().min(0).max(MAX_GROUP_SELECTIONS).optional(),
    maxSelections: z.number().int().min(1).max(MAX_GROUP_SELECTIONS).optional(),
    sortOrder: modifierSortOrderSchema.optional(),
    status: modifierStatusSchema.optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 1, 'Selectați cel puțin o modificare.');
export const createModifierOptionSchema = z
  .object({
    name: z.string().trim().min(1).max(100),
    extraPrice: priceSchema,
    sortOrder: modifierSortOrderSchema.optional(),
  })
  .strict();
export const updateModifierOptionSchema = z
  .object({
    version: versionSchema,
    name: z.string().trim().min(1).max(100).optional(),
    extraPrice: priceSchema.optional(),
    sortOrder: modifierSortOrderSchema.optional(),
    status: modifierStatusSchema.optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 1, 'Selectați cel puțin o modificare.');
export const createProductModifierGroupSchema = z
  .object({ modifierGroupId: idSchema, sortOrder: modifierSortOrderSchema.optional() })
  .strict();
export const updateProductModifierGroupSchema = z
  .object({
    version: versionSchema,
    sortOrder: modifierSortOrderSchema.optional(),
    status: modifierStatusSchema.optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 1, 'Selectați cel puțin o modificare.');
