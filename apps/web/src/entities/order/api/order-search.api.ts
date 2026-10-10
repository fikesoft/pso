import type {
  OrderSearchRequest,
  OrderSearchResponse,
  OrderCreatorsResponse,
} from '@pos/contracts';
import type { Api } from '../../../shared/api';
export async function searchOrders(api: Api, body: OrderSearchRequest) {
  return (await api.http.post<OrderSearchResponse>('/orders/search', body)).data;
}
export async function readOrderCreators(api: Api, locationId: string, cursor?: string) {
  return (
    await api.http.get<OrderCreatorsResponse>('/orders/creators', {
      params: { locationId, cursor },
    })
  ).data;
}
