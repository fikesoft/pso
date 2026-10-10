import { useCallback, useEffect, useRef, useState } from 'react';
import type { CatalogResponse } from '@pos/contracts';
import {
  useRemoteData,
  useInvalidation,
  useCoalescedInvalidation,
  isAccessRejection,
} from '../../../shared/lib';
import { readCatalog } from '../api/catalog.api';
import { readCatalogWindow } from '../lib/catalog-window';
import { CATALOG_SEARCH_DEBOUNCE_MS } from '../config/search.constants';
import { useCatalogAvailability } from './use-catalog-availability';
import type {
  CatalogSearchFilters,
  CatalogSearchPage,
  OrderCatalogSearchInput,
} from './catalog-search.types';
import type { SetCatalogData } from './catalog.types';
export function useOrderCatalogSearch({ api, locationId, enabled }: OrderCatalogSearchInput) {
  const [query, setQuery] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [appliedQuery, setAppliedQuery] = useState('');
  const normalized = query.trim();
  useEffect(() => {
    const timer = setTimeout(() => setAppliedQuery(normalized), CATALOG_SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [normalized]);
  const filterKey = JSON.stringify([locationId, appliedQuery, categoryId, enabled]);
  const categories = useRef<CatalogResponse['categories']>([]);
  const activeKey = useRef(filterKey);
  activeKey.current = filterKey;
  if (!enabled) categories.current = [];
  const safeRead = useCallback(
    async (
      cursor: string | undefined,
      filters: CatalogSearchFilters,
      key: string,
      background: boolean,
    ) => {
      try {
        return await readCatalog(api, locationId, cursor, false, background, filters);
      } catch (error) {
        if (activeKey.current === key && isAccessRejection(error)) categories.current = [];
        throw error;
      }
    },
    [api, locationId],
  );
  const desired = useRef({ filterKey, depth: 1 });
  if (desired.current.filterKey !== filterKey) desired.current = { filterKey, depth: 1 };
  const load = useCallback(
    async (): Promise<CatalogSearchPage> => ({
      ...(enabled
        ? await safeRead(
            undefined,
            { q: appliedQuery || undefined, categoryId: categoryId || undefined },
            filterKey,
            false,
          )
        : { categories: [], products: [], nextCursor: null }),
      filterKey,
      pageDepth: 1,
    }),
    [safeRead, enabled, appliedQuery, categoryId, filterKey],
  );
  const resource = useRemoteData(load);
  const current = useRef({ resource, filterKey, appliedQuery, categoryId, enabled });
  current.current = { resource, filterKey, appliedQuery, categoryId, enabled };
  const refresh = useCallback(async () => {
    const snapshot = current.current;
    if (!snapshot.enabled) return;
    const depth = desired.current.depth;
    await snapshot.resource.revalidate(
      async () => ({
        ...(await readCatalogWindow(
          (cursor) =>
            safeRead(
              cursor,
              {
                q: snapshot.appliedQuery || undefined,
                categoryId: snapshot.categoryId || undefined,
              },
              snapshot.filterKey,
              true,
            ),
          depth,
        )),
        filterKey: snapshot.filterKey,
        pageDepth: depth,
      }),
      isAccessRejection,
    );
  }, [safeRead]);
  const signal = useInvalidation(`catalog:${locationId}`);
  const liveBusy = useCoalescedInvalidation(signal, refresh);
  const paging = useRef(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const pending =
    normalized !== appliedQuery ||
    resource.loading ||
    (!resource.error && resource.data?.filterKey !== filterKey);
  const disabled = pending || !!resource.error || resource.data?.filterKey !== filterKey;
  const canRetryMore =
    !!resource.error &&
    resource.data?.filterKey === filterKey &&
    !!resource.data.nextCursor &&
    !pending;
  async function more() {
    if ((disabled && !canRetryMore) || liveBusy || paging.current || !resource.data?.nextCursor)
      return;
    desired.current.depth = Math.max(desired.current.depth, resource.data.pageDepth + 1);
    paging.current = true;
    setLoadingMore(true);
    try {
      await refresh();
    } finally {
      paging.current = false;
      setLoadingMore(false);
    }
  }
  const setAvailability = useCallback<SetCatalogData>(
    (update) => {
      resource.setData((previous) => {
        const next = typeof update === 'function' ? update(previous) : update;
        return next && previous
          ? { ...next, filterKey: previous.filterKey, pageDepth: previous.pageDepth }
          : previous;
      });
    },
    [resource.setData],
  );
  useCatalogAvailability(api, locationId, resource.data, setAvailability);
  if (enabled && resource.data?.filterKey === filterKey)
    categories.current = resource.data.categories;
  const data: CatalogResponse = (enabled ? resource.data : null) ?? {
    categories: categories.current,
    products: [],
    nextCursor: null,
  };
  return {
    ...resource,
    data,
    refresh,
    more,
    loadingMore,
    liveBusy,
    search: {
      query,
      categoryId,
      pending,
      disabled,
      canRetryMore,
      retry: refresh,
      error: resource.error,
      setQuery,
      setCategoryId,
    },
  };
}
