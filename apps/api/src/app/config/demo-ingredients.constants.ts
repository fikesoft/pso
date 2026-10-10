import type { DemoIngredient } from '../model/demo-catalog.types';

// Nume, porții și prețuri observate la https://norisushi.md/ pe 26.09.2026.
// Cantitățile ingredientelor sunt estimări DEMO, nu rețete oficiale.
export const DEMO_INGREDIENTS: Record<string, DemoIngredient> = {
  rice: { name: 'Orez sushi preparat', unit: 'G' },
  salmon: { name: 'Somon', unit: 'G' },
  tuna: { name: 'Ton', unit: 'G' },
  shrimp: { name: 'Creveți', unit: 'G' },
  cheese: { name: 'Cremă de brânză', unit: 'G' },
  cucumber: { name: 'Castravete', unit: 'G' },
  avocado: { name: 'Avocado', unit: 'G' },
  nori: { name: 'Alge nori', unit: 'G' },
  sesame: { name: 'Susan', unit: 'G' },
  cream: { name: 'Frișcă', unit: 'G' },
  chocolate: { name: 'Ciocolată', unit: 'G' },
  berries: { name: 'Fructe de sezon', unit: 'G' },
  sugar: { name: 'Zahăr', unit: 'G' },
  tobiko: { name: 'Icre tobiko', unit: 'G' },
  unagi: { name: 'Sos unagi', unit: 'G' },
  eel: { name: 'Țipar', unit: 'G' },
  chuka: { name: 'Salată chuka', unit: 'G' },
  soySheet: { name: 'Foi de soia cu susan', unit: 'G' },
  egg: { name: 'Ou', unit: 'G' },
  flour: { name: 'Făină', unit: 'G' },
  vanilla: { name: 'Vanilie', unit: 'G' },
  almond: { name: 'Fulgi de migdale', unit: 'G' },
  cola: { name: 'Coca Cola 500 ml', unit: 'PCS' },
  fanta: { name: 'Fanta 500 ml', unit: 'PCS' },
  sprite: { name: 'Sprite 500 ml', unit: 'PCS' },
  dorna: { name: 'Dorna 500 ml', unit: 'PCS' },
};
