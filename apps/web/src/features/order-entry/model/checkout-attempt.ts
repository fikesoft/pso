import { cashShiftMessages } from '@pos/ui/locales';
import type { CheckoutAttempt, CheckoutAttemptInput } from './checkout.types';
export function checkoutAttempt(value: CheckoutAttemptInput): CheckoutAttempt {
  const base = { version: value.version, requestKey: value.requestKey };
  if (value.mode === 'DEMO') return { mode: 'DEMO', input: base };
  if (!value.cashShiftId) throw new Error(cashShiftMessages.required);
  const input = { ...base, cashShiftId: value.cashShiftId, confirmed: true as const };
  return {
    mode: 'MANUAL',
    input:
      value.method === 'CASH'
        ? { ...input, method: 'CASH', receivedAmount: value.receivedAmount.trim() }
        : { ...input, method: 'CARD' },
  };
}
