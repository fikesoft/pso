import type { prepareCatalogSearch } from './catalog-search-setup';
export type CatalogSearchFixture = Awaited<ReturnType<typeof prepareCatalogSearch>>;
