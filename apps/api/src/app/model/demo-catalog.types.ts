export type DemoIngredient = {
  name: string;
  unit: 'G' | 'ML' | 'PCS';
};
export type DemoMenuProduct = {
  sku: string;
  name: string;
  category: string;
  description: string;
  portion: string;
  price: string;
  components: Record<string, string>;
  ingredientsUnknown?: boolean;
  synthetic?: boolean;
};
