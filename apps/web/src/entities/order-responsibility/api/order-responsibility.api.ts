import type {
  OrderResponsibilityListRequest,
  OrderResponsibilityListResponse,
  OrderResponsibilityDetailResponse,
  OrderResponsibilityHistoryResponse,
  OrderResponsibilityCommandRequest,
  OrderResponsibilityCommandResponse,
  OrderResponsibilityCommandIdentity,
  OrderResponsibilityResolutionResponse,
} from '@pos/contracts/order-responsibilities';
import type { Api } from '../../../shared/api';
export async function readResponsibilities(api: Api, params: OrderResponsibilityListRequest) {
  return (
    await api.http.get<OrderResponsibilityListResponse>('/order-responsibilities', { params })
  ).data;
}
export async function readResponsibility(api: Api, orderId: string, locationId: string) {
  return (
    await api.http.get<OrderResponsibilityDetailResponse>(`/orders/${orderId}/responsibility`, {
      params: { locationId },
    })
  ).data;
}
export async function readResponsibilityHistory(
  api: Api,
  orderId: string,
  locationId: string,
  cursor?: string,
) {
  return (
    await api.http.get<OrderResponsibilityHistoryResponse>(
      `/orders/${orderId}/responsibility-events`,
      { params: { locationId, limit: 50, ...(cursor ? { cursor } : {}) } },
    )
  ).data;
}
export async function executeResponsibility(
  api: Api,
  orderId: string,
  body: OrderResponsibilityCommandRequest,
) {
  return (
    await api.http.post<OrderResponsibilityCommandResponse>(
      `/orders/${orderId}/responsibility-commands`,
      body,
    )
  ).data;
}
export async function resolveResponsibility(
  api: Api,
  identity: OrderResponsibilityCommandIdentity,
) {
  const { orderId, ...body } = identity;
  return (
    await api.http.post<OrderResponsibilityResolutionResponse>(
      `/orders/${orderId}/responsibility-commands/resolution`,
      body,
    )
  ).data;
}
