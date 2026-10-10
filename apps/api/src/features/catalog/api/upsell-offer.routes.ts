import type { Router } from 'express';
import { acceptUpsellOfferSchema, idSchema, showUpsellOfferSchema } from '@pos/contracts';
import { endpoint, scopeFor } from '../../../entities/tenant-access';
import { rateLimit } from '../../../entities/session';
import { upsellOfferResponse } from '../../../entities/upsell';
import { assert } from '../../../shared/lib/http';
import { requestHash } from '../../../shared/lib/idempotency';
import { requireUpsellSuggestionAccess, selectUpsellSuggestions } from '../model/upsell-selection';

export function addUpsellOfferRoutes(router: Router) {
  router.post(
    '/catalog/upsell-offers',
    endpoint(async (tx, access, auth, req) => {
      const body = showUpsellOfferSchema.parse(req.body);
      requireUpsellSuggestionAccess(access, auth.user.id, body.locationId);
      assert(
        access.service.canUse(
          auth.user.id,
          'orders.create',
          scopeFor(access.org.id, { scopeType: 'LOCATION', locationId: body.locationId }),
        ),
      );
      const hash = requestHash({ ...body, productIds: [...body.productIds].sort() });
      const previous = await tx.upsellOffer.findFirst({
        where: {
          locationId: body.locationId,
          createdByUserId: auth.user.id,
          requestKey: body.requestKey,
        },
      });
      if (previous) {
        assert(
          previous.requestHash === hash,
          409,
          'Cheia cererii a fost folosită pentru alte date',
        );
        return { offer: upsellOfferResponse(previous) };
      }
      await rateLimit(`upsell-show:${access.org.id}:${auth.user.id}`, 120);
      const { selected } = await selectUpsellSuggestions(tx, body.locationId, body.productIds);
      const candidate = selected.find(
        ({ rule }) => rule.id === body.ruleId && rule.version === body.ruleVersion,
      );
      assert(candidate, 409, 'Recomandarea s-a schimbat. Reîncărcați.');
      const { rule } = candidate;
      const offer = await tx.upsellOffer.create({
        data: {
          organizationId: access.org.id,
          locationId: body.locationId,
          ruleId: rule.id,
          ruleVersion: rule.version,
          ruleName: rule.name,
          sourceProductId: rule.sourceProductId,
          targetProductId: rule.targetProductId,
          createdByUserId: auth.user.id,
          requestKey: body.requestKey,
          requestHash: hash,
        },
      });
      return { offer: upsellOfferResponse(offer) };
    }),
  );
  router.post(
    '/catalog/upsell-offers/:id/accept',
    endpoint(async (tx, access, auth, req) => {
      acceptUpsellOfferSchema.parse(req.body);
      const id = idSchema.parse(req.params.id);
      const offer = await tx.upsellOffer.findFirst({
        where: { id, createdByUserId: auth.user.id },
      });
      assert(offer, 404, 'Recomandarea nu există');
      requireUpsellSuggestionAccess(access, auth.user.id, offer.locationId);
      assert(
        access.service.canUse(
          auth.user.id,
          'orders.create',
          scopeFor(access.org.id, { scopeType: 'LOCATION', locationId: offer.locationId }),
        ),
      );
      assert(!offer.claimedOrderId, 409, 'Recomandarea este deja atribuită unei comenzi.');
      const accepted = offer.acceptedAt
        ? offer
        : await tx.upsellOffer.update({ where: { id }, data: { acceptedAt: new Date() } });
      return { offer: upsellOfferResponse(accepted) };
    }),
  );
}
