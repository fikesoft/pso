import axios from 'axios';
import type {
  CheckoutResponse,
  DemoCheckoutRequest,
  ManualCheckoutRequest,
  ReceiptResponse,
} from '@pos/contracts';
import type { Api } from '../../../shared/api';
export async function readReceipt(api: Api, id: string) {
  try {
    const { data } = await api.http.get<ReceiptResponse>(`/orders/${id}/receipt`);
    return data.receipt;
  } catch (error) {
    if (axios.isAxiosError(error) && error.response?.status === 404) return null;
    throw error;
  }
}
export async function checkoutDemo(api: Api, id: string, input: DemoCheckoutRequest) {
  const { data } = await api.http.post<CheckoutResponse>(`/orders/${id}/checkout/demo`, input);
  return data;
}
export async function checkoutManual(api: Api, id: string, input: ManualCheckoutRequest) {
  const { data } = await api.http.post<CheckoutResponse>(`/orders/${id}/checkout/manual`, input);
  return data;
}
