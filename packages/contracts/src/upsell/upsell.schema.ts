import { z } from 'zod';
import { idSchema, versionSchema } from '../shared';
import { MAX_UPSELL_CART_PRODUCTS } from './config/upsell.constants';

export const createUpsellRuleSchema = z
  .object({
    requestKey: idSchema,
    locationId: idSchema,
    sourceProductId: idSchema,
    targetProductId: idSchema,
    name: z.string().trim().min(2).max(100),
    sortOrder: z.number().int().min(0).max(100_000).default(0),
  })
  .strict()
  .refine(
    (rule) => rule.sourceProductId !== rule.targetProductId,
    'Recomandarea trebuie să indice un alt produs.',
  );
export const updateUpsellRuleSchema = z
  .object({
    version: versionSchema,
    name: z.string().trim().min(2).max(100),
    sortOrder: z.number().int().min(0).max(100_000),
    status: z.enum(['ACTIVE', 'ARCHIVED']),
  })
  .strict();
export const upsellRulesQuerySchema = z
  .object({
    locationId: idSchema,
    cursor: idSchema.optional(),
    limit: z.coerce.number().int().min(1).max(100).default(25),
    includeArchived: z
      .enum(['true', 'false'])
      .transform((value) => value === 'true')
      .optional(),
  })
  .strict();
export const upsellSuggestionsSchema = z
  .object({
    locationId: idSchema,
    productIds: z
      .array(idSchema)
      .max(MAX_UPSELL_CART_PRODUCTS)
      .refine((ids) => new Set(ids).size === ids.length, 'Produsele din coș nu se repetă.'),
  })
  .strict();

export const showUpsellOfferSchema = upsellSuggestionsSchema
  .extend({
    requestKey: idSchema,
    ruleId: idSchema,
    ruleVersion: versionSchema,
  })
  .strict();
export const acceptUpsellOfferSchema = z.object({}).strict();
export const upsellMetricsQuerySchema = z
  .object({
    locationId: idSchema,
    ruleIds: z
      .string()
      .transform((value) => value.split(','))
      .pipe(z.array(idSchema).min(1).max(100)),
    from: z.iso.datetime(),
    to: z.iso.datetime(),
  })
  .strict()
  .refine((value) => {
    const duration = Date.parse(value.to) - Date.parse(value.from);
    return duration > 0 && duration <= 366 * 24 * 60 * 60 * 1000;
  }, 'Alegeți o perioadă de cel mult 366 de zile.');
