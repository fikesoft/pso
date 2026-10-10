import { useEffect, useState } from 'react';
import { MENU_AVAILABILITY_REFRESH_MS } from '@pos/contracts/menu-schedules';
import type { Api } from '../../../shared/api';
import { useInvalidation } from '../../../shared/lib';
import { readCatalogProduct } from '../api/catalog.api';

// A modifier picker can originate from recommendations outside the loaded catalog page.
export function useProductAvailability(api: Api, locationId: string, productId?: string) {
  const signal = useInvalidation(`catalog:${locationId}`);
  const [availableId, setAvailableId] = useState<string | null>(null);
  useEffect(() => {
    let disposed = false;
    let busy = false;
    setAvailableId(null);
    async function refresh() {
      if (!productId || busy || document.visibilityState !== 'visible') return;
      busy = true;
      try {
        const current = await readCatalogProduct(api, productId, locationId, true);
        if (!disposed)
          setAvailableId(
            current.enabled &&
              current.status === 'ACTIVE' &&
              current.price !== null &&
              current.scheduleAvailability?.available !== false
              ? productId
              : null,
          );
      } catch {
        if (!disposed) setAvailableId(null);
      } finally {
        busy = false;
      }
    }
    void refresh();
    const resume = () => void refresh();
    const timer = window.setInterval(resume, MENU_AVAILABILITY_REFRESH_MS);
    window.addEventListener('focus', resume);
    document.addEventListener('visibilitychange', resume);
    return () => {
      disposed = true;
      window.clearInterval(timer);
      window.removeEventListener('focus', resume);
      document.removeEventListener('visibilitychange', resume);
    };
  }, [api, locationId, productId, signal]);
  return !!productId && availableId === productId;
}
