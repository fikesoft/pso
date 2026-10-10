import { describe, expect, it } from 'vitest';
import { collectPaymentSchema, refundPaymentSchema } from './payments.schema';

const requestKey = '00000000-0000-4000-8000-000000000001';
describe('manual financial commands', () => {
  it('normalizes exact amounts larger than Number can safely represent', () => {
    const parsed = collectPaymentSchema.parse({
      version: 2,
      requestKey,
      confirmed: true,
      payments: [
        { method: 'CASH', amount: '9007199254740993.01', receivedAmount: '9007199254740994' },
      ],
    });
    expect(parsed.payments[0]).toEqual({
      method: 'CASH',
      amount: '9007199254740993.01',
      receivedAmount: '9007199254740994.00',
    });
  });
  it('rejects zero, negative, exponential, excessive precision and overflow allocations', () => {
    for (const amount of ['0', '-1', '1e2', '1.001', '10000000000000000', 'NaN']) {
      expect(
        collectPaymentSchema.safeParse({
          version: 2,
          requestKey,
          confirmed: true,
          payments: [{ method: 'CARD', amount }],
        }).success,
      ).toBe(false);
    }
  });
  it('requires explicit confirmation, a cash tender and unique allocation methods', () => {
    const body = { version: 2, requestKey, payments: [{ method: 'CARD', amount: '1' }] };
    expect(collectPaymentSchema.safeParse(body).success).toBe(false);
    expect(
      collectPaymentSchema.safeParse({
        ...body,
        confirmed: true,
        payments: [body.payments[0], body.payments[0]],
      }).success,
    ).toBe(false);
    expect(
      collectPaymentSchema.safeParse({
        ...body,
        confirmed: true,
        payments: [{ method: 'CASH', amount: '1' }],
      }).success,
    ).toBe(false);
  });
  it('requires a refund reason and distinct original payments, and rejects client-controlled method/status', () => {
    const body = {
      version: 2,
      requestKey,
      confirmed: true,
      refunds: [{ paymentId: requestKey, amount: '1' }],
    };
    expect(refundPaymentSchema.safeParse(body).success).toBe(false);
    expect(refundPaymentSchema.parse({ ...body, reason: '  Retur parțial  ' }).reason).toBe(
      'Retur parțial',
    );
    expect(
      refundPaymentSchema.safeParse({
        ...body,
        reason: 'Retur',
        refunds: [body.refunds[0], body.refunds[0]],
      }).success,
    ).toBe(false);
    expect(
      refundPaymentSchema.safeParse({ ...body, reason: 'Retur', status: 'REFUNDED' }).success,
    ).toBe(false);
  });
});
