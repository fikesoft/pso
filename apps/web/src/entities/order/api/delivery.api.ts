import type {
  DeliveryCommand,
  DeliveryCommandResponse,
  DeliveryCouriersResponse,
  DeliveryResponse,
} from '@pos/contracts';
import type { Api } from '../../../shared/api';
export async function readDelivery(api: Api, id: string, cursor?: string) {
  return (await api.http.get<DeliveryResponse>(`/orders/${id}/delivery`, { params: { cursor } }))
    .data;
}
export async function readDeliveryCouriers(api: Api, id: string, cursor?: string) {
  return (
    await api.http.get<DeliveryCouriersResponse>(`/orders/${id}/delivery-couriers`, {
      params: { cursor },
    })
  ).data;
}
export async function updateDelivery(api: Api, id: string, body: DeliveryCommand) {
  return (await api.http.post<DeliveryCommandResponse>(`/orders/${id}/delivery`, body)).data;
}
