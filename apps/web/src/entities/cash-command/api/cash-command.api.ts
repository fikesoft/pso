import type {
  CashCommandIdentity,
  CashMovementResolutionResponse,
  CashShiftResolutionResponse,
  PaymentCommandResolutionResponse,
  ManualCheckoutResolutionResponse,
} from '@pos/contracts';
import type { Api } from '../../../shared/api';
export async function resolveCashCommand(api: Api, command: CashCommandIdentity) {
  if (command.kind === 'OPEN' || command.kind === 'CLOSE')
    return (await api.http.post<CashShiftResolutionResponse>('/cash-commands/resolution', command))
      .data;
  if ('shiftId' in command)
    return (
      await api.http.post<CashMovementResolutionResponse>(
        '/cash-movement-commands/resolution',
        command,
      )
    ).data;
  const { orderId, kind, locationId, requestKey } = command;
  if (kind === 'CHECKOUT_MANUAL')
    return (
      await api.http.post<ManualCheckoutResolutionResponse>(
        `/orders/${orderId}/manual-checkout-resolution`,
        { locationId, requestKey },
      )
    ).data;
  return (
    await api.http.post<PaymentCommandResolutionResponse>(
      `/orders/${orderId}/payment-commands/resolution`,
      { locationId, requestKey, kind },
    )
  ).data;
}
