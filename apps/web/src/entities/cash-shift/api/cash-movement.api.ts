import type {
  CashMovementCreateRequest,
  CashMovementCreateResponse,
  CashMovementListRequest,
  CashMovementListResponse,
} from '@pos/contracts/cash-movements';
import type { Api } from '../../../shared/api';
export async function createCashMovement(
  api: Api,
  shiftId: string,
  body: CashMovementCreateRequest,
) {
  return (
    await api.http.post<CashMovementCreateResponse>(`/cash-shifts/${shiftId}/movements`, body)
  ).data;
}
export async function readCashMovements(
  api: Api,
  shiftId: string,
  params: CashMovementListRequest,
) {
  return (
    await api.http.get<CashMovementListResponse>(`/cash-shifts/${shiftId}/movements`, { params })
  ).data;
}
