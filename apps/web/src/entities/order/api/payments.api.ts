import type {
  CollectPaymentRequest,
  RefundPaymentRequest,
  PaymentCommandResponse,
  PaymentsResponse,
  PaymentOperationsResponse,
} from '@pos/contracts';
import type { Api } from '../../../shared/api';

export async function readPayments(api: Api, id: string, cursor?: string) {
  return (await api.http.get<PaymentsResponse>(`/orders/${id}/payments`, { params: { cursor } }))
    .data;
}
export async function readPaymentOperations(api: Api, id: string, cursor?: string) {
  return (
    await api.http.get<PaymentOperationsResponse>(`/orders/${id}/payment-operations`, {
      params: { cursor },
    })
  ).data;
}
export async function collectPayment(api: Api, id: string, body: CollectPaymentRequest) {
  return (await api.http.post<PaymentCommandResponse>(`/orders/${id}/payments`, body)).data;
}
export async function refundPayment(api: Api, id: string, body: RefundPaymentRequest) {
  return (await api.http.post<PaymentCommandResponse>(`/orders/${id}/refunds`, body)).data;
}
