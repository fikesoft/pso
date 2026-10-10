import type {
  CashDiscrepancyQuery,
  CashDiscrepancyResponse,
  CashDiscrepancyRegisterQuery,
  CashDiscrepancyRegisterResponse,
} from '@pos/contracts/cash-discrepancies';
import type { Api } from '../../../shared/api';
export async function readCashDiscrepancies(api: Api, params: CashDiscrepancyQuery) {
  return (await api.http.get<CashDiscrepancyResponse>('/cash-shifts/discrepancies', { params }))
    .data;
}
export async function readDiscrepancyRegisters(api: Api, params: CashDiscrepancyRegisterQuery) {
  return (
    await api.http.get<CashDiscrepancyRegisterResponse>('/cash-shifts/discrepancy-registers', {
      params,
    })
  ).data;
}
