import type { Router } from 'express';
import { upsellSuggestionsSchema } from '@pos/contracts';
import { endpoint } from '../../../entities/tenant-access';
import { loadProductModifierConfigs } from '../../../entities/catalog-modifiers';
import { productResponse } from '../model/catalog-response';
import { requireUpsellSuggestionAccess, selectUpsellSuggestions } from '../model/upsell-selection';

export function addUpsellSuggestionRoutes(router: Router) {
  router.post(
    '/catalog/upsell-suggestions',
    endpoint(async (tx, access, auth, req) => {
      const body = upsellSuggestionsSchema.parse(req.body);
      requireUpsellSuggestionAccess(access, auth.user.id, body.locationId);
      const { selected, availability } = await selectUpsellSuggestions(
        tx,
        body.locationId,
        body.productIds,
      );
      const modifiers = await loadProductModifierConfigs(
        tx,
        selected.map(({ product }) => product.id),
      );
      return {
        suggestions: selected.map(({ rule, product, local }) => ({
          ruleId: rule.id,
          ruleVersion: rule.version,
          sourceProductId: rule.sourceProductId,
          target: productResponse(
            product,
            body.locationId,
            local,
            modifiers.get(product.id),
            availability.get(product.id),
          ),
        })),
      };
    }),
  );
}
