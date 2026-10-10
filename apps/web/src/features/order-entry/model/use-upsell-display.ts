import { useCallback, useRef } from 'react';
import type { UpsellSuggestion } from '@pos/contracts';
import type { Api } from '../../../shared/api';
import { showUpsellOffer } from '../../../entities/upsell';
import type { UpsellDisplay } from './upsell-entry.types';

export function useUpsellDisplay(api: Api, locationId: string, productIds: string[]) {
  const displays = useRef(new Map<string, UpsellDisplay>());
  const current = useRef(productIds);
  current.current = productIds;
  return useCallback(
    async (suggestion: UpsellSuggestion) => {
      const key = `${locationId}:${suggestion.ruleId}:${suggestion.ruleVersion}`;
      let display = displays.current.get(key);
      if (!display) {
        display = {
          input: {
            requestKey: crypto.randomUUID(),
            locationId,
            ruleId: suggestion.ruleId,
            ruleVersion: suggestion.ruleVersion,
            productIds: [...new Set(current.current)].sort(),
          },
        };
        displays.current.set(key, display);
      }
      if (display.offer) return display.offer;
      if (display.pending) return display.pending;
      const entry = display;
      entry.pending = showUpsellOffer(api, entry.input)
        .then((offer) => {
          entry.offer = offer;
          return offer;
        })
        .finally(() => {
          entry.pending = undefined;
        });
      return entry.pending;
    },
    [api, locationId],
  );
}
