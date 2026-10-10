import type {
  OrderDeliveryFeeCommand,
  OrderDeliveryFeePreview,
  OrderDeliveryFeeResult,
  OrderDeliveryFeeResolution,
} from '@pos/contracts';
import { orderDeliveryFeePreviewResponseSchema } from '@pos/contracts/delivery-zones';
import type { Api } from '../../../shared/api';
export async function previewOrderDeliveryFee(api: Api, id: string, body: OrderDeliveryFeePreview) {
  const { data } = await api.http.post(`/orders/${id}/delivery-fee/preview`, body);
  const quote = orderDeliveryFeePreviewResponseSchema.parse(data);
  if (quote.orderId !== id || quote.version !== body.version)
    throw new Error('Cotația nu corespunde comenzii.');
  return quote;
}
function validateResult(data: OrderDeliveryFeeResult, id: string, requestKey: string) {
  if (
    data.requestKey !== requestKey ||
    data.order?.id !== id ||
    !Number.isInteger(data.order.version) ||
    typeof data.order.deliveryFee !== 'string' ||
    typeof data.order.deliveryFeeConfirmed !== 'boolean'
  )
    throw new Error('Răspunsul tarifului nu corespunde cererii.');
  return data;
}
export async function applyOrderDeliveryFee(api: Api, id: string, body: OrderDeliveryFeeCommand) {
  const { data } = await api.http.post<OrderDeliveryFeeResult>(`/orders/${id}/delivery-fee`, body, {
    headers: { 'Idempotency-Key': body.requestKey },
  });
  validateResult(data, id, body.requestKey);
  if (data.resultVersion !== body.version + 1)
    throw new Error('Versiunea tarifului nu corespunde cererii.');
  return data;
}
export async function resolveOrderDeliveryFee(api: Api, id: string, requestKey: string) {
  const { data } = await api.http.post<OrderDeliveryFeeResolution>(
    `/orders/${id}/delivery-fee/resolution`,
    { requestKey },
    { headers: { 'Idempotency-Key': requestKey } },
  );
  validateResult(data, id, requestKey);
  if (
    !['SUCCEEDED', 'RETIRED'].includes(data.status) ||
    (data.status === 'RETIRED'
      ? data.resultVersion !== null
      : !Number.isInteger(data.resultVersion))
  )
    throw new Error('Rezoluția tarifului este invalidă.');
  return data;
}
