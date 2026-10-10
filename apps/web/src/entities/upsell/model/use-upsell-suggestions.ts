import { useCallback, useEffect } from 'react';
import { MENU_AVAILABILITY_REFRESH_MS } from '@pos/contracts/menu-schedules';
import type { Api } from '../../../shared/api';
import { useInvalidation, useRemoteData } from '../../../shared/lib';
import { readUpsellSuggestions } from '../api/upsell.api';

export function useUpsellSuggestions(api: Api, locationId: string, productIds: readonly string[]) {
  const cartKey = [...new Set(productIds)].sort().join(',');
  const read = useCallback(
    async () => ({
      cartKey,
      ...(await readUpsellSuggestions(api, locationId, cartKey ? cartKey.split(',') : [])),
    }),
    [api, locationId, cartKey],
  );
  const resource = useRemoteData(read);
  const { revalidate } = resource;
  const signal = useInvalidation(`catalog:${locationId}`);
  useEffect(() => {
    if (signal) void revalidate(read);
  }, [read, revalidate, signal]);
  useEffect(() => {
    const refresh = () => {
      if (document.visibilityState === 'visible') void revalidate(read);
    };
    const timer = window.setInterval(refresh, MENU_AVAILABILITY_REFRESH_MS);
    window.addEventListener('focus', refresh);
    document.addEventListener('visibilitychange', refresh);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener('focus', refresh);
      document.removeEventListener('visibilitychange', refresh);
    };
  }, [read, revalidate]);
  return {
    ...resource,
    suggestions: resource.data?.cartKey === cartKey ? resource.data.suggestions : [],
  };
}
