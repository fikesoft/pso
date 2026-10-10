import type {
  CashRegisterListRequest,
  CashRegisterListResponse,
  CashRegisterResponse,
  CashRegisterResolutionRequest,
  CashRegisterResolutionResponse,
} from '@pos/contracts';
import type { Api } from '../../../shared/api';
import type { CashRegisterAttempt } from '../model/cash-register.types';

export async function readCashRegisters(api: Api, params: CashRegisterListRequest) {
  const { data } = await api.http.get<CashRegisterListResponse>('/cash-registers', { params });
  return data;
}
export async function sendCashRegisterCommand(api: Api, attempt: CashRegisterAttempt) {
  const result =
    attempt.kind === 'CREATE'
      ? await api.http.post<CashRegisterResponse>('/cash-registers', attempt.body)
      : attempt.kind === 'RENAME'
        ? await api.http.patch<CashRegisterResponse>(
            `/cash-registers/${attempt.registerId}`,
            attempt.body,
          )
        : await api.http.post<CashRegisterResponse>(
            `/cash-registers/${attempt.registerId}/archive`,
            attempt.body,
          );
  return result.data;
}
export async function resolveCashRegisterCommand(api: Api, body: CashRegisterResolutionRequest) {
  const { data } = await api.http.post<CashRegisterResolutionResponse>(
    '/cash-register-commands/resolution',
    body,
  );
  return data;
}
