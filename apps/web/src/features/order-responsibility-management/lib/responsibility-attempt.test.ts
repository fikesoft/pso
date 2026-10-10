import { describe, expect, it } from 'vitest';
import { responsibilityAttemptIdentity } from './responsibility-attempt';
import type { ResponsibilityAttempt } from '../model/responsibility-management.types';
const base = {
  locationId: '11111111-1111-4111-8111-111111111111',
  requestKey: '22222222-2222-4222-8222-222222222222',
  orderVersion: 7,
  responsibilityVersion: 2,
  reason: 'Motiv operațional',
};
const orderId = '33333333-3333-4333-8333-333333333333',
  shiftId = '44444444-4444-4444-8444-444444444444';
describe('responsibility identity from frozen attempt', () => {
  it('omits versions and all reasons, including the manager exception', () => {
    const attempt: ResponsibilityAttempt = {
      orderId,
      body: {
        ...base,
        kind: 'PREPARE_HANDOFF',
        sourceShiftId: shiftId,
        managerReason: 'Recuperare autorizată',
      },
    };
    const serialized = JSON.stringify(attempt);
    expect(responsibilityAttemptIdentity(attempt)).toEqual({
      orderId,
      locationId: base.locationId,
      requestKey: base.requestKey,
      kind: 'PREPARE_HANDOFF',
      sourceShiftId: shiftId,
    });
    expect(JSON.stringify(attempt)).toBe(serialized);
  });
  it('keeps the exact pending event and target for acceptance', () => {
    const handoffEventId = '55555555-5555-4555-8555-555555555555';
    expect(
      responsibilityAttemptIdentity({
        orderId,
        body: { ...base, kind: 'ACCEPT_HANDOFF', targetShiftId: shiftId, handoffEventId },
      }),
    ).toMatchObject({ kind: 'ACCEPT_HANDOFF', targetShiftId: shiftId, handoffEventId });
  });
  it('keeps explicit assignment distinct from acceptance', () => {
    expect(
      responsibilityAttemptIdentity({
        orderId,
        body: { ...base, kind: 'ASSIGN', targetShiftId: shiftId },
      }),
    ).toEqual({
      ...{ orderId, locationId: base.locationId, requestKey: base.requestKey },
      kind: 'ASSIGN',
      targetShiftId: shiftId,
    });
  });
});
