import { repeatMessages as text } from '@pos/ui/locales';
import type { OrderLastCustomerOrderResponse, OrderRepeatPreviewResponse } from '@pos/contracts';
import type { Api } from '../../../shared/api';
export async function readOrderRepeat(api: Api, orderId: string, locationId: string) {
  const { data } = await api.http.post<OrderRepeatPreviewResponse>(
    `/orders/${orderId}/repeat-preview`,
    { locationId },
  );
  if (
    data?.source?.id !== orderId ||
    data.locationId !== locationId ||
    data.source.status === 'DRAFT' ||
    !Array.isArray(data.lines) ||
    !Array.isArray(data.products)
  )
    throw new Error(text.invalidPreview);
  return data;
}
export async function readLastCustomerOrder(
  api: Api,
  customerId: string,
  locationId: string,
  cursor?: string,
) {
  return (
    await api.http.get<OrderLastCustomerOrderResponse>(`/customers/${customerId}/last-order`, {
      params: { locationId, cursor },
    })
  ).data;
}
