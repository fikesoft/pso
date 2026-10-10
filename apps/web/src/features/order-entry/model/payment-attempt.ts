import { collectPaymentSchema, refundPaymentSchema } from '@pos/contracts/payments';
import type { PaymentAttempt, PaymentFormState } from './payments.types';

export function paymentAttempt(
  form: PaymentFormState,
  version: number,
  requestKey: string,
  cashShiftId: string,
): PaymentAttempt {
  const base = { version, requestKey, confirmed: form.confirmed, cashShiftId };
  if (form.kind === 'REFUND') {
    const parsed = refundPaymentSchema.safeParse({
      ...base,
      reason: form.reason,
      refunds: [{ paymentId: form.payment?.id, amount: form.refundAmount }],
    });
    if (!parsed.success) throw new Error(parsed.error.issues[0]?.message);
    return { kind: 'REFUND', body: parsed.data };
  }
  const payments = [];
  if (form.method !== 'CARD')
    payments.push({ method: 'CASH', amount: form.cashAmount, receivedAmount: form.receivedAmount });
  if (form.method !== 'CASH') payments.push({ method: 'CARD', amount: form.cardAmount });
  const parsed = collectPaymentSchema.safeParse({ ...base, payments });
  if (!parsed.success) throw new Error(parsed.error.issues[0]?.message);
  return { kind: 'COLLECT', body: parsed.data };
}
