import type { NUTRITION_BASES } from './config/product-information.constants';
export interface ProductInformation {
  calories: string | null;
  protein: string | null;
  fat: string | null;
  carbs: string | null;
  nutritionBasis: (typeof NUTRITION_BASES)[number];
  allergens: string[] | null;
  ingredients: string[] | null;
}
