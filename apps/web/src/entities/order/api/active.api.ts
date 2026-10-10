import type { ActiveOrdersResponse } from '@pos/contracts';
import type { Api } from '../../../shared/api';
export async function readActiveOrders(api: Api, locationId: string, cursor?: string) {
  return (
    await api.http.get<ActiveOrdersResponse>('/orders/active', {
      params: { locationId, ...(cursor ? { cursor } : {}) },
    })
  ).data;
}
