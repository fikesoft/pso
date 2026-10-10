import { courierWorkListResponseSchema, courierWorkItemSchema } from '@pos/contracts/courier-work';
import type { CourierWorkQuery } from '@pos/contracts';
import { courierWorkMessages as text } from '@pos/ui/locales';
import type { Api } from '../../../shared/api';
export async function readCourierWork(api: Api, userId: string, query: CourierWorkQuery) {
  const { data } = await api.http.get('/courier-work', { params: query });
  const parsed = courierWorkListResponseSchema.parse(data);
  if (
    parsed.locationId !== query.locationId ||
    parsed.courierUserId !== userId ||
    parsed.view !== query.view
  )
    throw new Error(text.invalidResponse);
  return parsed;
}
export async function readCourierWorkItem(
  api: Api,
  userId: string,
  locationId: string,
  orderId: string,
) {
  const { data } = await api.http.get(`/courier-work/${orderId}`, { params: { locationId } });
  const parsed = courierWorkItemSchema.parse(data.order);
  if (
    parsed.locationId !== locationId ||
    parsed.courierUserId !== userId ||
    parsed.orderId !== orderId
  )
    throw new Error(text.invalidResponse);
  return parsed;
}
