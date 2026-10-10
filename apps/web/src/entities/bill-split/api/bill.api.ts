import type {
  BillSplitListRequest,
  BillSplitListResponse,
  BillSplitPreviewRequest,
  BillSplitPreviewDto,
  BillSplitDto,
  BillPaymentPreview,
} from '@pos/contracts/bill-splits';
import type { Api } from '../../../shared/api';
export async function previewBillSplit(api: Api, body: BillSplitPreviewRequest) {
  return (await api.http.post<{ preview: BillSplitPreviewDto }>('/bill-splits/preview', body)).data
    .preview;
}
export async function readBillSplit(api: Api, locationId: string, id: string) {
  return (
    await api.http.get<{ split: BillSplitDto }>(`/bill-splits/${id}`, { params: { locationId } })
  ).data.split;
}
export async function previewBillPayment(api: Api, locationId: string, id: string) {
  return (
    await api.http.get<{ preview: BillPaymentPreview }>(`/bill-parts/${id}/payment-preview`, {
      params: { locationId },
    })
  ).data.preview;
}

export async function listBillSplits(api: Api, params: BillSplitListRequest) {
  return (await api.http.get<BillSplitListResponse>('/bill-splits', { params })).data;
}
