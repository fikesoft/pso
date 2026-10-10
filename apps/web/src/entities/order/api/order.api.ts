import type { OrderResponse, OrdersResponse, KitchenTicket } from '@pos/contracts';
import type { Api } from '../../../shared/api';
import type {
  CreateOrderInput,
  UpdateOrderInput,
  OrderCommandAction,
  OrderCommandInput,
} from '../model/order-request.types';
export async function readOrders(api: Api, locationId: string, cursor?: string) {
  const { data } = await api.http.get<OrdersResponse>('/orders', {
    params: { locationId, cursor },
  });
  return data;
}
export async function readOrder(api: Api, id: string) {
  const { data } = await api.http.get<OrderResponse>(`/orders/${id}`);
  return data.order;
}
export async function createOrder(api: Api, input: CreateOrderInput) {
  const { data } = await api.http.post<OrderResponse>('/orders', input, {
    headers: { 'Idempotency-Key': input.requestKey },
  });
  return data.order;
}
export async function updateOrder(api: Api, id: string, input: UpdateOrderInput) {
  const { data } = await api.http.patch<OrderResponse>(`/orders/${id}`, input);
  return data.order;
}
export async function sendOrder(api: Api, id: string, version: number, requestKey: string) {
  const { data } = await api.http.post<OrderResponse & { ticket: KitchenTicket }>(
    `/orders/${id}/send`,
    { version, requestKey },
  );
  return data;
}
export async function cancelOrder(api: Api, id: string, version: number) {
  const { data } = await api.http.post<OrderResponse>(`/orders/${id}/cancel`, { version });
  return data.order;
}
export async function executeOrderCommand(
  api: Api,
  id: string,
  action: OrderCommandAction,
  body: OrderCommandInput,
) {
  const { data } = await api.http.post<OrderResponse>(`/orders/${id}/${action}`, body);
  return data.order;
}
