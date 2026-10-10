import { z } from 'zod';
import { idSchema, versionSchema } from '../shared';

export const inventoryKindSchema = z.enum(['INGREDIENT', 'PACKAGING', 'CONSUMABLE']);
export const inventoryUnitSchema = z.enum(['G', 'ML', 'PCS']);
export const inventoryStatusSchema = z.enum(['ACTIVE', 'ARCHIVED']);
export const recipePurposeSchema = z.enum(['MAIN', 'AUXILIARY', 'PACKAGING', 'CONSUMABLE']);
export const inventoryDocumentKindSchema = z.enum(['RECEIPT', 'WASTE', 'COUNT', 'CONSUMPTION']);
const reasonSchema = z.string().trim().min(3).max(500);
const quantitySchema = z.string().regex(/^(?:0|[1-9]\d{0,11})(?:\.\d{1,6})?$/);
function canonical(value: string, scale: number) {
  const [whole, fraction = ''] = value.split('.');
  return `${whole}.${fraction.padEnd(scale, '0')}`;
}
export const inventoryQuantitySchema = quantitySchema.transform((value) => canonical(value, 6));
export const inventorySignedQuantitySchema = z
  .string()
  .regex(/^-?(?:0|[1-9]\d{0,11})(?:\.\d{1,6})?$/)
  .transform((value) => {
    const positive = canonical(value.replace(/^-/, ''), 6);
    return value.startsWith('-') && /[1-9]/.test(value) ? `-${positive}` : positive;
  });
export const recipeQuantitySchema = z
  .string()
  .regex(/^(?:0|[1-9]\d{0,5})(?:\.\d{1,3})?$/)
  .refine((value) => /[1-9]/.test(value), 'Cantitatea trebuie să fie pozitivă.')
  .transform((value) => canonical(value, 3));
export const inventoryPageSchema = z.object({
  cursor: idSchema.optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});
export const inventoryItemsQuerySchema = inventoryPageSchema
  .extend({
    locationId: idSchema.optional(),
    status: inventoryStatusSchema.optional(),
  })
  .strict();
export const inventoryProductsQuerySchema = inventoryPageSchema.strict();
export const inventoryMovementsQuerySchema = inventoryPageSchema
  .extend({
    locationId: idSchema,
    inventoryItemId: idSchema.optional(),
    kind: inventoryDocumentKindSchema.optional(),
  })
  .strict();
export const createInventoryItemSchema = z
  .object({
    sku: z.string().trim().min(1).max(60),
    name: z.string().trim().min(1).max(150),
    kind: inventoryKindSchema,
    unit: inventoryUnitSchema,
  })
  .strict();
export const updateInventoryItemSchema = z
  .object({
    version: versionSchema,
    name: z.string().trim().min(1).max(150).optional(),
    status: inventoryStatusSchema.optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 1, 'Selectați cel puțin o modificare.');
export const recipeComponentSchema = z
  .object({
    inventoryItemId: idSchema,
    purpose: recipePurposeSchema,
    quantityPerUnit: recipeQuantitySchema,
    serviceTypes: z
      .array(z.enum(SERVICE_TYPES))
      .min(1)
      .max(SERVICE_TYPES.length)
      .refine((values) => new Set(values).size === values.length, 'Tipuri de servire duplicate.')
      .transform((values) => values.sort()),
  })
  .strict();
export const createRecipeSchema = z
  .object({
    expectedVersion: z.number().int().min(0),
    requestKey: idSchema,
    reason: reasonSchema,
    components: z.array(recipeComponentSchema).max(50),
  })
  .strict()
  .refine(
    (value) =>
      new Set(value.components.map((line) => line.inventoryItemId)).size ===
      value.components.length,
    'Un articol poate apărea o singură dată în rețetă.',
  );
export const createModifierRecipeSchema = z
  .object({
    expectedVersion: z.number().int().min(0),
    requestKey: idSchema,
    reason: reasonSchema,
    components: z.array(recipeComponentSchema).max(20),
  })
  .strict()
  .refine(
    (value) =>
      new Set(value.components.map((line) => line.inventoryItemId)).size ===
      value.components.length,
    'Un articol poate apărea o singură dată în rețeta modificatorului.',
  );
export const createInventoryDocumentSchema = z
  .object({
    locationId: idSchema,
    inventoryItemId: idSchema,
    kind: z.enum(['RECEIPT', 'WASTE', 'COUNT']),
    quantity: inventoryQuantitySchema,
    expectedQuantity: inventorySignedQuantitySchema.optional(),
    reason: reasonSchema,
    requestKey: idSchema,
  })
  .strict()
  .superRefine((value, context) => {
    if (value.kind === 'COUNT' && value.expectedQuantity === undefined)
      context.addIssue({
        code: 'custom',
        path: ['expectedQuantity'],
        message: 'Stocul observat este obligatoriu.',
      });
    if (value.kind !== 'COUNT' && value.expectedQuantity !== undefined)
      context.addIssue({
        code: 'custom',
        path: ['expectedQuantity'],
        message: 'Stocul observat este permis numai la inventariere.',
      });
    if (value.kind !== 'COUNT' && !/[1-9]/.test(value.quantity))
      context.addIssue({
        code: 'custom',
        path: ['quantity'],
        message: 'Cantitatea trebuie să fie pozitivă.',
      });
  });
import { SERVICE_TYPES } from '../orders/config/order.constants';
