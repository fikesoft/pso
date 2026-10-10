import type {
  KitchenRoutingDto,
  KitchenRoutingSetRequest,
  KitchenRoutingIdentity,
  KitchenRoutingResolutionResponse,
  KitchenRoutingProductsResponse,
} from '@pos/contracts/kitchen-stations';
import type { Api } from '../../../shared/api';
export async function readRoutingProducts(
  api: Api,
  locationId: string,
  search: string,
  cursor?: string,
) {
  return (
    await api.http.get<KitchenRoutingProductsResponse>('/kitchen-routing/products', {
      params: { locationId, search, cursor, limit: 50 },
    })
  ).data;
}
export async function setKitchenRouting(api: Api, body: KitchenRoutingSetRequest) {
  return (await api.http.put<{ routing: KitchenRoutingDto }>('/kitchen-routing', body)).data;
}
export async function resolveKitchenRouting(api: Api, command: KitchenRoutingIdentity) {
  return (
    await api.http.post<KitchenRoutingResolutionResponse>(
      '/kitchen-routing-commands/resolution',
      command,
    )
  ).data;
}
