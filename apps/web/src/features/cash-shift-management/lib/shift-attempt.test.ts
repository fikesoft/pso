import { describe, expect, it, vi } from 'vitest';
import type { Api } from '../../../shared/api';
import type { ShiftAttempt } from '../model/shift-management.types';
import { sendShiftAttempt, shiftAttemptIdentity } from './shift-attempt';
const attempt: ShiftAttempt = {
  kind: 'CASH_OUT',
  shiftId: '33333333-3333-4333-8333-333333333333',
  body: {
    locationId: '11111111-1111-4111-8111-111111111111',
    requestKey: '22222222-2222-4222-8222-222222222222',
    version: 7,
    direction: 'OUT',
    amount: '7.00',
    reason: 'Depunere în seif',
  },
};
describe('cash movement attempt dispatch', () => {
  it('keeps resolver identity free of financial body fields', () => {
    expect(shiftAttemptIdentity(attempt)).toEqual({
      kind: 'CASH_OUT',
      shiftId: attempt.shiftId,
      locationId: attempt.body.locationId,
      requestKey: attempt.body.requestKey,
    });
  });
  it('dispatches the original body on repeated sends and only reads immutable movement identity', async () => {
    const post = vi.fn().mockResolvedValue({ data: { movement: { shiftId: attempt.shiftId } } });
    const api = { http: { post } } as unknown as Api;
    const frozen = structuredClone(attempt);
    await sendShiftAttempt(api, frozen);
    await sendShiftAttempt(api, frozen);
    expect(post.mock.calls[0]).toEqual([`/cash-shifts/${attempt.shiftId}/movements`, attempt.body]);
    expect(post.mock.calls[1]).toEqual(post.mock.calls[0]);
    expect(post.mock.calls[0][1]).toBe(frozen.body);
  });
  it('refuses a direction and kind mismatch before reserving identity', () => {
    expect(() => shiftAttemptIdentity({ ...attempt, kind: 'CASH_IN' })).toThrow();
  });
});
