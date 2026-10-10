import { z } from 'zod';
import {
  MAX_PRODUCT_ALLERGENS,
  MAX_PRODUCT_INGREDIENTS,
  MAX_PRODUCT_INFORMATION_LABEL,
  NUTRITION_BASES,
} from './config/product-information.constants';

export const nutrientAmountSchema = z
  .string()
  .regex(
    /^(0|[1-9]\d{0,5})(\.\d{1,3})?$/,
    'Introduceți o valoare între 0 și 999999,999, cu maximum trei zecimale.',
  );
function declaredList(maximum: number) {
  return z
    .array(z.string().trim().min(1).max(MAX_PRODUCT_INFORMATION_LABEL))
    .max(maximum)
    .refine(
      (items) =>
        new Set(items.map((value) => value.toLocaleLowerCase('ro-MD'))).size === items.length,
      'Lista nu poate conține duplicate.',
    )
    .nullable();
}
export const productInformationSchema = z
  .object({
    calories: nutrientAmountSchema.nullable().optional(),
    protein: nutrientAmountSchema.nullable().optional(),
    fat: nutrientAmountSchema.nullable().optional(),
    carbs: nutrientAmountSchema.nullable().optional(),
    nutritionBasis: z.enum(NUTRITION_BASES).optional(),
    allergens: declaredList(MAX_PRODUCT_ALLERGENS).optional(),
    ingredients: declaredList(MAX_PRODUCT_INGREDIENTS).optional(),
  })
  .strict();
