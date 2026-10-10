import { inventoryMessages as text } from '@pos/ui/locales';
export const INVENTORY_KIND_LABELS = {
  INGREDIENT: text.ingredient,
  PACKAGING: text.packaging,
  CONSUMABLE: text.consumable,
} as const;
export const INVENTORY_UNIT_LABELS = {
  G: text.grams,
  ML: text.milliliters,
  PCS: text.pieces,
} as const;
export const INVENTORY_UNIT_SYMBOLS = { G: 'g', ML: 'ml', PCS: 'buc' } as const;
export const MOVEMENT_LABELS = {
  RECEIPT: text.receipt,
  WASTE: text.waste,
  COUNT: text.count,
  CONSUMPTION: text.consumption,
} as const;
export const PURPOSE_LABELS = {
  MAIN: text.main,
  AUXILIARY: text.auxiliary,
  PACKAGING: text.packaging,
  CONSUMABLE: text.consumable,
} as const;
export const PURPOSES_BY_KIND = {
  INGREDIENT: ['MAIN', 'AUXILIARY'],
  PACKAGING: ['PACKAGING'],
  CONSUMABLE: ['CONSUMABLE'],
} as const;
export const INVENTORY_QUANTITY_PATTERN = '(?:0|[1-9][0-9]{0,11})(?:\\.[0-9]{1,6})?';
export const RECIPE_QUANTITY_PATTERN = '(?:0|[1-9][0-9]{0,5})(?:\\.[0-9]{1,3})?';
export const MAX_RECIPE_COMPONENTS = 50;
export const MAX_MODIFIER_RECIPE_COMPONENTS = 20;
