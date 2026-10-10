export const NUTRITION_BASES = ['PER_PORTION', 'PER_100G', 'PER_100ML'] as const;
export const MAX_PRODUCT_INGREDIENTS = 100;
export const MAX_PRODUCT_ALLERGENS = 30;
export const MAX_PRODUCT_INFORMATION_LABEL = 100;
export const EMPTY_PRODUCT_INFORMATION = {
  calories: null,
  protein: null,
  fat: null,
  carbs: null,
  nutritionBasis: 'PER_PORTION',
  allergens: null,
  ingredients: null,
} as const;
export const NUTRIENT_FIELDS = ['calories', 'protein', 'fat', 'carbs'] as const;
