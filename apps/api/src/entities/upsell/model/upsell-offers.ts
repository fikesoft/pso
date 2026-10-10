import type { TenantTransaction } from '@pos/db';
import { assert } from '../../../shared/lib/http';
import type { UpsellAttributionInput, StoredUpsellOffer } from './upsell-offers.types';

export function upsellOfferResponse(offer: StoredUpsellOffer) {
  return {
    id: offer.id,
    ruleId: offer.ruleId,
    ruleVersion: offer.ruleVersion,
    targetProductId: offer.targetProductId,
    shownAt: offer.shownAt.toISOString(),
    acceptedAt: offer.acceptedAt?.toISOString() ?? null,
  };
}
export async function validateOrderUpsellOffers(
  tx: TenantTransaction,
  locationId: string,
  userId: string,
  items: readonly UpsellAttributionInput[],
) {
  const ids = items.flatMap((item) =>
    !item.id && item.sourceUpsellOfferId ? [item.sourceUpsellOfferId] : [],
  );
  assert(
    new Set(ids).size === ids.length,
    400,
    'Recomandarea poate fi atribuită unei singure linii.',
  );
  const offers = await tx.upsellOffer.findMany({
    where: { id: { in: ids }, locationId, createdByUserId: userId },
  });
  const result = new Map<number, string>();
  items.forEach((item, position) => {
    if (item.id) {
      assert(item.sourceUpsellOfferId === undefined, 400, 'Atribuirea recomandării este fixă.');
      return;
    }
    if (!item.sourceUpsellOfferId) return;
    const offer = offers.find((value) => value.id === item.sourceUpsellOfferId);
    assert(
      offer &&
        offer.targetProductId === item.productId &&
        offer.acceptedAt &&
        !offer.claimedOrderId,
      409,
      'Recomandarea nu poate fi atribuită acestei linii.',
    );
    result.set(position, offer.id);
  });
  return result;
}
