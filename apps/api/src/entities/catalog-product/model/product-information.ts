import type { Prisma } from '@pos/db';
import type { ProductInformation } from '@pos/contracts';
import type { ProductInformationInput } from './product-information.types';

export function productInformation(
  product: Prisma.ProductGetPayload<Record<string, never>>,
): ProductInformation {
  return {
    calories: product.calories?.toFixed(3) ?? null,
    protein: product.protein?.toFixed(3) ?? null,
    fat: product.fat?.toFixed(3) ?? null,
    carbs: product.carbs?.toFixed(3) ?? null,
    nutritionBasis: product.nutritionBasis as ProductInformation['nutritionBasis'],
    allergens: product.allergensDeclared ? product.allergens : null,
    ingredients: product.ingredientsDeclared ? product.ingredients : null,
  };
}
export function productInformationWrite<T extends ProductInformationInput>(input: T) {
  const { allergens, ingredients, ...fields } = input;
  return {
    ...fields,
    ...(allergens === undefined
      ? {}
      : { allergens: allergens ?? [], allergensDeclared: allergens !== null }),
    ...(ingredients === undefined
      ? {}
      : { ingredients: ingredients ?? [], ingredientsDeclared: ingredients !== null }),
  };
}
