import { useEffect, useRef } from 'react';
import type { CatalogResponse } from '@pos/contracts';
import {
  MENU_AVAILABILITY_BATCH_SIZE,
  MENU_AVAILABILITY_REFRESH_MS,
} from '@pos/contracts/menu-schedules';
import type { Api } from '../../../shared/api';
import { readMenuAvailability } from '../api/catalog.api';
import type { SetCatalogData } from './catalog.types';

export function useCatalogAvailability(
  api: Api,
  locationId: string,
  data: CatalogResponse | null,
  setData: SetCatalogData,
) {
  const current = useRef(data);
  current.current = data;
  useEffect(() => {
    let disposed = false;
    let busy = false;
    async function refresh() {
      if (busy || document.visibilityState !== 'visible') return;
      const snapshot = current.current;
      if (!snapshot?.products.length) return;
      busy = true;
      try {
        const ids = snapshot.products
          .filter((product) => product.locationVersion !== null)
          .map((product) => product.id);
        for (let offset = 0; offset < ids.length; offset += MENU_AVAILABILITY_BATCH_SIZE) {
          const result = await readMenuAvailability(
            api,
            locationId,
            ids.slice(offset, offset + MENU_AVAILABILITY_BATCH_SIZE),
          );
          if (disposed) return;
          const availability = new Map(
            result.products.map((product) => [product.productId, product.scheduleAvailability]),
          );
          setData((value) =>
            value
              ? {
                  ...value,
                  products: value.products.map((product) => {
                    const next = availability.get(product.id);
                    return next &&
                      (!product.scheduleAvailability ||
                        next.checkedAt >= product.scheduleAvailability.checkedAt)
                      ? { ...product, scheduleAvailability: next }
                      : product;
                  }),
                }
              : value,
          );
        }
      } catch {
        // Keep the last display value offline. Every write checks the database clock again.
      } finally {
        busy = false;
      }
    }
    const timer = window.setInterval(() => void refresh(), MENU_AVAILABILITY_REFRESH_MS);
    const resume = () => void refresh();
    window.addEventListener('focus', resume);
    document.addEventListener('visibilitychange', resume);
    return () => {
      disposed = true;
      window.clearInterval(timer);
      window.removeEventListener('focus', resume);
      document.removeEventListener('visibilitychange', resume);
    };
  }, [api, locationId, setData]);
}
