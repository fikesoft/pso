import { useEffect, useRef } from 'react';
import { useInvalidation } from '../../../shared/lib';
import type { Api } from '../../../shared/api';
import { readCatalog } from '../api/catalog.api';
import type { CatalogResource } from './catalog.types';

export function useCatalogInvalidation(
  api: Api,
  locationId: string,
  resource: CatalogResource,
  includeArchived = false,
) {
  const signal = useInvalidation(`catalog:${locationId}`);
  const current = useRef(resource);
  current.current = resource;
  useEffect(() => {
    if (!signal) return;
    const loaded = current.current.data?.products.length ?? 0;
    void current.current.revalidate(async () => {
      const first = await readCatalog(api, locationId, undefined, includeArchived, true);
      const products = [...first.products];
      let cursor = first.nextCursor;
      while (cursor && products.length < loaded) {
        const page = await readCatalog(api, locationId, cursor, includeArchived, true);
        products.push(...page.products);
        cursor = page.nextCursor;
      }
      return { ...first, products, nextCursor: cursor };
    });
  }, [api, locationId, signal, includeArchived]);
}
