export const pendingPurchaseKey = 'pos-local-pending-purchase-v1';
export const errorMessages = {
  WEBSITE_NOT_CONFIGURED: 'Backendul website-ului nu are cheia POS configurată.',
  POS_UNAVAILABLE:
    'POS nu răspunde. Reîncearcă aceeași comandă; confirmarea poate să se fi pierdut.',
  INVALID_API_KEY: 'Cheia backendului este invalidă, expirată sau revocată.',
  WEBSITE_KEY_INVALID: 'Cheia backendului este invalidă, expirată sau revocată.',
  WEBSITE_PRICE_CHANGED:
    'Prețul s-a schimbat. Reîncarcă produsele și verifică prețul nou înainte de cumpărare.',
  MENU_SCHEDULE_UNAVAILABLE:
    'Un produs este în afara programului meniului. Reîncarcă produsele și alege o opțiune disponibilă.',
  MODIFIER_CONFIGURATION_STALE: 'Opțiunile s-au schimbat. Reîncarcă produsele și refă selecția.',
  RATE_LIMITED: 'Prea multe cereri. Așteaptă un minut și reîncearcă.',
};
export const statusLabels = {
  AWAITING_ACCEPTANCE: 'Comanda a fost salvată în POS și așteaptă confirmarea operatorului.',
  ACCEPTED: 'Comanda a fost acceptată în POS.',
  REJECTED: 'Comanda a fost respinsă de operator.',
};
export const availabilityRefreshMs = 60_000;
export const informationLabels = {
  title: 'Nutriție și ingrediente',
  allergens: 'Alergeni',
  ingredients: 'Ingrediente',
  allergensUnknown: 'Informațiile despre alergeni nu sunt configurate.',
  ingredientsUnknown: 'Ingredientele nu sunt configurate.',
  allergensEmpty: 'Nu sunt declarați alergeni.',
  ingredientsEmpty: 'Nu sunt declarate ingrediente.',
  nutritionUnknown: 'Valorile nutriționale nu sunt configurate.',
  unset: 'Neconfigurat',
  bases: { PER_PORTION: 'Pentru o porție', PER_100G: 'Pentru 100 g', PER_100ML: 'Pentru 100 ml' },
  nutrients: {
    calories: 'Energie (kcal)',
    protein: 'Proteine (g)',
    fat: 'Grăsimi (g)',
    carbs: 'Carbohidrați (g)',
  },
};
