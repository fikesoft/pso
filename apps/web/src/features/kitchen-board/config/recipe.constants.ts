import { inventoryMessages as text } from '@pos/ui/locales';
export const KITCHEN_RECIPE_UNITS = { G: 'g', ML: 'ml', PCS: 'buc' } as const;
export const KITCHEN_RECIPE_PURPOSES = {
  MAIN: text.main,
  AUXILIARY: text.auxiliary,
  PACKAGING: text.packaging,
  CONSUMABLE: text.consumable,
} as const;
