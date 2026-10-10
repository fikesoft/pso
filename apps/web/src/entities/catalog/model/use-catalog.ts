import { useCallback } from 'react';
import type { Api } from '../../../shared/api';
import { useRemoteData } from '../../../shared/lib';
import { readCatalog } from '../api/catalog.api';
import { useCatalogAvailability } from './use-catalog-availability';
import { useCatalogInvalidation } from './use-catalog-invalidation';
export function useCatalog(api: Api, locationId: string, includeArchived = false) {
  const load = useCallback(
    () => readCatalog(api, locationId, undefined, includeArchived),
    [api, locationId, includeArchived],
  );
  const resource = useRemoteData(load);
  useCatalogAvailability(api, locationId, resource.data, resource.setData);
  useCatalogInvalidation(api, locationId, resource, includeArchived);
  async function more() {
    const cursor = resource.data?.nextCursor;
    if (!cursor) return;
    await resource.append(
      () => readCatalog(api, locationId, cursor, includeArchived),
      (current, page) => ({ ...page, products: [...current.products, ...page.products] }),
    );
  }
  return { ...resource, more, moreLoading: resource.loadingMore };
}
