import type {
  KitchenResponse,
  KitchenTicket,
  KitchenStationOptionsResponse,
  KitchenArrivalResponse,
  KitchenRecipeResponse,
} from '@pos/contracts';
import type { Api } from '../../../shared/api';
export async function readKitchenRecipe(api: Api, ticketId: string, itemId: string) {
  return (
    await api.http.get<KitchenRecipeResponse>(`/kitchen/tickets/${ticketId}/items/${itemId}/recipe`)
  ).data;
}
export async function readKitchenArrivals(api: Api, locationId: string, stationId?: string) {
  return (
    await api.http.get<KitchenArrivalResponse>('/kitchen/arrivals', {
      params: { locationId, stationId },
    })
  ).data;
}
export async function readKitchen(
  api: Api,
  locationId: string,
  status: KitchenTicket['status'],
  cursor?: string,
  stationId?: string,
) {
  const { data } = await api.http.get<KitchenResponse>('/kitchen/tickets', {
    params: { locationId, status, cursor, stationId },
  });
  return { ...data, receivedAt: performance.now() };
}
export async function readKitchenStationOptions(api: Api, locationId: string, cursor?: string) {
  return (
    await api.http.get<KitchenStationOptionsResponse>('/kitchen/station-options', {
      params: { locationId, cursor, limit: 50 },
    })
  ).data;
}
export async function updateKitchen(
  api: Api,
  ticket: KitchenTicket,
  status: 'PREPARING' | 'PARTIALLY_READY' | 'READY',
  batchId?: string,
) {
  const batch = batchId ? ticket.batches.find((entry) => entry.id === batchId) : undefined;
  if (batchId && !batch) throw new Error('Grupul stației nu există în tichet.');
  const { data } = await api.http.patch<{ ticket: KitchenTicket }>(
    `/kitchen/tickets/${ticket.id}${batch ? `/batches/${batch.id}` : ''}`,
    { version: batch?.version ?? ticket.version, status },
  );
  return data.ticket;
}
