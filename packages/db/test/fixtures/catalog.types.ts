export type CatalogRace = {
  productAction: 'create' | 'restore';
  winner: 'product' | 'category';
  isolation: 'READ COMMITTED' | 'REPEATABLE READ';
};
