import type { CatalogResponse, CatalogSearchQuery } from '@pos/contracts';
import type { Api } from '../../../shared/api';
export type CatalogSearchFilters = Pick<CatalogSearchQuery, 'q' | 'categoryId'>;
export interface OrderCatalogSearchInput {
  api: Api;
  locationId: string;
  enabled: boolean;
}
export interface CatalogSearchPage extends CatalogResponse {
  filterKey: string;
  pageDepth: number;
}
export interface CatalogSearchControls {
  query: string;
  categoryId: string;
  pending: boolean;
  disabled: boolean;
  canRetryMore: boolean;
  retry: () => Promise<void>;
  error: string;
  setQuery: (query: string) => void;
  setCategoryId: (categoryId: string) => void;
}
