import type { CatalogProduct, CatalogResponse, MenuAvailabilityResponse } from '@pos/contracts';
import type { CatalogSearchFilters } from '../model/catalog-search.types';
import type { Api } from '../../../shared/api';
export async function readCatalog(
  api: Api,
  locationId: string,
  cursor?: string,
  includeArchived = false,
  background = false,
  filters: CatalogSearchFilters = {},
) {
  const { data } = await api.http.get<CatalogResponse>('/catalog', {
    params: {
      locationId,
      cursor,
      ...filters,
      ...(includeArchived ? { includeArchived: 'true' } : {}),
    },
    ...(background ? { headers: { 'X-POS-Background': 'true' } } : {}),
  });
  return data;
}

export async function readCatalogProduct(
  api: Api,
  productId: string,
  locationId: string,
  background = false,
) {
  const { data } = await api.http.get<{ product: CatalogProduct }>(
    `/catalog/products/${productId}`,
    {
      params: { locationId },
      ...(background ? { headers: { 'X-POS-Background': 'true' } } : {}),
    },
  );
  return data.product;
}

export async function readMenuAvailability(api: Api, locationId: string, productIds: string[]) {
  return (
    await api.http.get<MenuAvailabilityResponse>('/catalog/menu-availability', {
      params: { locationId, productIds: productIds.join(',') },
      headers: { 'X-POS-Background': 'true' },
    })
  ).data;
}
