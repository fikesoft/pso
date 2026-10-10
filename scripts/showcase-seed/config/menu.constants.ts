import { DEMO_MENU } from '../../../apps/api/src/app/config/demo-menu.constants';
import type { DemoMenuProduct } from '../../../apps/api/src/app/model/demo-catalog.types';

// Additional products are invented exercises, never attributed to the official Nori menu.
export const SYNTHETIC_ROLLS = [
  ['PHILADELPHIA', 'Philadelphia Classic', '169.00'],
  ['CALIFORNIA', 'California cu somon', '159.00'],
  ['CANADA', 'Canada cu țipar', '189.00'],
  ['TEMPURA-SALMON', 'Tempura Salmon', '175.00'],
  ['TEMPURA-EBI', 'Tempura Ebi', '179.00'],
  ['VEGGIE', 'Veggie Garden', '119.00'],
  ['SPICY-TUNA', 'Spicy Tuna', '165.00'],
  ['SALMON-CHEESE', 'Somon și brânză', '159.00'],
  ['AVOCADO-SESAME', 'Avocado și susan', '125.00'],
  ['EBI-CRUNCH', 'Ebi Crunch', '185.00'],
  ['DRAGON', 'Dragon Roll', '199.00'],
  ['SAKURA', 'Sakura Roll', '169.00'],
  ['RAINBOW', 'Rainbow Roll', '189.00'],
  ['HOT-SALMON', 'Hot Salmon', '175.00'],
  ['TOKYO', 'Tokyo Roll', '179.00'],
  ['KYOTO', 'Kyoto Roll', '155.00'],
  ['NIGIRI-SALMON', 'Nigiri somon', '95.00'],
  ['NIGIRI-TUNA', 'Nigiri ton', '99.00'],
  ['GUNKAN', 'Gunkan crevete', '109.00'],
  ['CHUKA', 'Rulou Chuka', '115.00'],
] as const;
export const SYNTHETIC_EXTRAS = [
  ['SET-FAMILY', 'Set Familie', 'Seturi sushi', '48 bucăți · 1600 g', '799.00'],
  ['SET-OFFICE', 'Set Birou', 'Seturi sushi', '64 bucăți · 2100 g', '1099.00'],
  ['SET-VEGGIE', 'Set Vegetarian', 'Seturi sushi', '24 bucăți · 750 g', '349.00'],
  ['BOWL-SALMON', 'Bowl cu somon', 'Bowl DEMO', '350 g · 1 porție', '189.00'],
  ['BOWL-VEGGIE', 'Bowl vegetal', 'Bowl DEMO', '350 g · 1 porție', '149.00'],
  ['CHUKA-SALAD', 'Salată Chuka', 'Salate DEMO', '180 g · 1 porție', '89.00'],
  ['FRUIT-DESSERT', 'Desert cu fructe', 'Deserturi', '150 g · 1 porție', '79.00'],
  ['CHOCOLATE-DESSERT', 'Desert cu ciocolată', 'Deserturi', '150 g · 1 porție', '85.00'],
] as const;
export const EXTRA_COMPONENTS: readonly Record<string, string>[] = [
  { rice: '700', salmon: '150', nori: '25', avocado: '125' },
  { rice: '900', shrimp: '200', nori: '35', cheese: '180' },
  { rice: '450', avocado: '180', nori: '20', cucumber: '100' },
  { rice: '180', salmon: '80', avocado: '60', cucumber: '30' },
  { rice: '180', chuka: '80', avocado: '60', cucumber: '30' },
  { chuka: '150', sesame: '10', cucumber: '20' },
  { cheese: '50', berries: '75', sugar: '25' },
  { cheese: '50', cream: '60', chocolate: '40' },
];
export const SHOWCASE_MENU: readonly DemoMenuProduct[] = [
  ...DEMO_MENU,
  ...SYNTHETIC_ROLLS.map<DemoMenuProduct>(([sku, name, price], index) => ({
    sku: `SHOWCASE-${sku}`,
    name: `${name} · DEMO`,
    category: 'Rulouri DEMO',
    description: 'Produs sintetic pentru exercițiu POS. Ingrediente și cantități estimative.',
    portion: '260 g · 8 bucăți',
    price,
    synthetic: true,
    components: {
      rice: '140',
      nori: '5',
      cucumber: '35',
      cheese: '30',
      ...(index % 3 === 0
        ? { salmon: '50' }
        : index % 3 === 1
          ? { shrimp: '50' }
          : { avocado: '50' }),
    },
  })),
  ...SYNTHETIC_EXTRAS.map<DemoMenuProduct>(([sku, name, category, portion, price], index) => ({
    sku: `SHOWCASE-${sku}`,
    name: `${name} · DEMO`,
    category,
    portion,
    price,
    synthetic: true,
    description:
      'Exemplu sintetic; porția, prețul și rețeta nu reprezintă oferta oficială Nori Sushi.',
    components: EXTRA_COMPONENTS[index]!,
  })),
];
