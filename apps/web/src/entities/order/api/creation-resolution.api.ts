import type {
  OrderCreationResolutionRequest,
  OrderCreationResolutionResponse,
} from '@pos/contracts';
import type { Api } from '../../../shared/api';
export async function resolveOrderCreation(api: Api, body: OrderCreationResolutionRequest) {
  return (
    await api.http.post<OrderCreationResolutionResponse>('/orders/creation-resolution', body, {
      headers: { 'Idempotency-Key': body.requestKey },
    })
  ).data;
}
