import type {
  CashShiftListRequest,
  CashShiftListResponse,
  CashShiftDetailResponse,
  CashShiftOpenRequest,
  CashShiftOpenResponse,
  CashShiftCloseRequest,
  CashShiftCloseResponse,
} from '@pos/contracts';
import type { Api } from '../../../shared/api';
export async function readCashShifts(api: Api, params: CashShiftListRequest) {
  return (await api.http.get<CashShiftListResponse>('/cash-shifts', { params })).data;
}
export async function readCashShift(api: Api, id: string, locationId: string) {
  return (
    await api.http.get<CashShiftDetailResponse>(`/cash-shifts/${id}`, { params: { locationId } })
  ).data;
}
export async function openCashShift(api: Api, registerId: string, body: CashShiftOpenRequest) {
  return (await api.http.post<CashShiftOpenResponse>(`/cash-registers/${registerId}/open`, body))
    .data;
}
export async function closeCashShift(api: Api, shiftId: string, body: CashShiftCloseRequest) {
  return (await api.http.post<CashShiftCloseResponse>(`/cash-shifts/${shiftId}/close`, body)).data;
}
