import { describe, expect, it } from 'vitest';
import type { PaymentRecord } from '@pos/contracts';
import type { PaymentFormState } from './payments.types';
import { paymentAttempt } from './payment-attempt';
function form(): PaymentFormState {
  return {
    kind: 'COLLECT',
    method: 'MIXED',
    cashAmount: '10.00',
    cardAmount: '5.00',
    receivedAmount: '20.00',
    refundAmount: '',
    reason: '',
    payment: null,
    confirmed: true,
  };
}
describe('new financial attempt snapshot', () => {
  it('includes the explicit shift for mixed payments and remains independent of later form edits', () => {
    const input = form();
    const attempt = paymentAttempt(
      input,
      3,
      '11111111-1111-4111-8111-111111111111',
      '22222222-2222-4222-8222-222222222222',
    );
    input.cashAmount = '99.00';
    input.method = 'CARD';
    expect(attempt).toEqual({
      kind: 'COLLECT',
      body: {
        version: 3,
        requestKey: '11111111-1111-4111-8111-111111111111',
        cashShiftId: '22222222-2222-4222-8222-222222222222',
        confirmed: true,
        payments: [
          { method: 'CASH', amount: '10.00', receivedAmount: '20.00' },
          { method: 'CARD', amount: '5.00' },
        ],
      },
    });
  });
  it('requires a valid explicit shift even for card-only collection', () => {
    expect(() =>
      paymentAttempt({ ...form(), method: 'CARD' }, 1, '11111111-1111-4111-8111-111111111111', ''),
    ).toThrow();
  });
  it('allocates refund to selected payout shift instead of copying payment provenance', () => {
    const input = {
      ...form(),
      kind: 'REFUND' as const,
      refundAmount: '2.00',
      reason: 'Retur autorizat',
      payment: { id: '33333333-3333-4333-8333-333333333333' } as PaymentRecord,
    };
    const attempt = paymentAttempt(
      input,
      4,
      '11111111-1111-4111-8111-111111111111',
      '22222222-2222-4222-8222-222222222222',
    );
    expect(attempt.body).toMatchObject({
      cashShiftId: '22222222-2222-4222-8222-222222222222',
      refunds: [{ paymentId: input.payment.id, amount: '2.00' }],
    });
  });
});
