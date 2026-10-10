import type { ShowUpsellOffer, UpsellOfferDto, UpsellSuggestionsResponse } from '@pos/contracts';
import type { Api } from '../../../shared/api';
export async function readUpsellSuggestions(api: Api, locationId: string, productIds: string[]) {
  return (
    await api.http.post<UpsellSuggestionsResponse>(
      '/catalog/upsell-suggestions',
      { locationId, productIds },
      { headers: { 'X-POS-Background': 'true' } },
    )
  ).data;
}
export async function showUpsellOffer(api: Api, input: ShowUpsellOffer) {
  return (
    await api.http.post<{ offer: UpsellOfferDto }>('/catalog/upsell-offers', input, {
      headers: { 'X-POS-Background': 'true' },
    })
  ).data.offer;
}
export async function acceptUpsellOffer(api: Api, id: string) {
  return (await api.http.post<{ offer: UpsellOfferDto }>(`/catalog/upsell-offers/${id}/accept`, {}))
    .data.offer;
}
