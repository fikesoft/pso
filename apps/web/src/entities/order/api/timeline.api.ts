import type { OrderTimelineResponse } from '@pos/contracts';
import type { Api } from '../../../shared/api';
export async function readOrderTimeline(api: Api, id: string, cursor?: string) {
  return (
    await api.http.get<OrderTimelineResponse>(`/orders/${id}/timeline`, { params: { cursor } })
  ).data;
}
