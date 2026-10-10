import { describe, expect, it } from 'vitest';
import type { OrderResponsibilityCommandIdentity } from '@pos/contracts/order-responsibilities';
import type { ResponsibilityPointer, ResponsibilityStorage } from '../model/responsibility.types';
import {
  clearResponsibilityPointer,
  readResponsibilityPointer,
  responsibilityPointerKey,
  sameResponsibilityCommand,
  storeResponsibilityPointer,
} from './responsibility-pointer';
const scope = {
  organizationId: 'organization',
  actorUserId: 'actor',
  locationId: '11111111-1111-4111-8111-111111111111',
};
const base = {
  locationId: scope.locationId,
  requestKey: '22222222-2222-4222-8222-222222222222',
  orderId: '33333333-3333-4333-8333-333333333333',
};
const shiftId = '44444444-4444-4444-8444-444444444444';
const commands: OrderResponsibilityCommandIdentity[] = [
  { ...base, kind: 'ASSIGN', targetShiftId: shiftId },
  { ...base, kind: 'PREPARE_HANDOFF', sourceShiftId: shiftId },
  {
    ...base,
    kind: 'ACCEPT_HANDOFF',
    targetShiftId: shiftId,
    handoffEventId: '55555555-5555-4555-8555-555555555555',
  },
];
function storage(): ResponsibilityStorage {
  const data = new Map<string, string>();
  return {
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => {
      data.set(key, value);
    },
    removeItem: (key) => {
      data.delete(key);
    },
  };
}
describe('order responsibility scoped recovery identity', () => {
  it('roundtrips each exact typed identity without body fields', () => {
    const target = storage();
    for (const command of commands) {
      const pointer = { ...scope, command, reason: 'private', amount: '100', name: 'private' };
      storeResponsibilityPointer(target, pointer);
      expect(readResponsibilityPointer(target, scope)).toEqual({ ...scope, command });
      expect(target.getItem(responsibilityPointerKey(scope))).not.toContain('private');
      clearResponsibilityPointer(target, pointer);
      expect(readResponsibilityPointer(target, scope)).toBeNull();
    }
  });
  it('does not move a pointer across organization, actor or location', () => {
    const target = storage();
    storeResponsibilityPointer(target, { ...scope, command: commands[0]! });
    for (const change of [
      { organizationId: 'other' },
      { actorUserId: 'other' },
      { locationId: shiftId },
    ])
      expect(readResponsibilityPointer(target, { ...scope, ...change })).toBeNull();
  });
  it('rejects changed kind, order, key and target instead of clearing a pending command', () => {
    const target = storage(),
      pointer = { ...scope, command: commands[0]! };
    storeResponsibilityPointer(target, pointer);
    for (const command of [
      commands[1]!,
      { ...commands[0]!, orderId: shiftId },
      { ...commands[0]!, requestKey: shiftId },
      { ...base, kind: 'ASSIGN' as const, targetShiftId: base.orderId },
    ]) {
      expect(sameResponsibilityCommand(pointer.command, command)).toBe(false);
      expect(() => clearResponsibilityPointer(target, { ...scope, command })).toThrow();
      expect(() => storeResponsibilityPointer(target, { ...scope, command })).toThrow();
    }
  });
  it('rejects a stale handoff event when all other ACCEPT targets match', () => {
    const command = commands[2]!;
    expect(
      sameResponsibilityCommand(command, {
        ...command,
        handoffEventId: shiftId,
      } as OrderResponsibilityCommandIdentity),
    ).toBe(false);
  });
  it('fails closed on corrupt data and body enrichment', () => {
    const target = storage();
    for (const raw of [
      '{',
      JSON.stringify({ ...scope, command: { ...commands[0], reason: 'secret' } }),
      JSON.stringify({ ...scope, actorUserId: 'other', command: commands[0] }),
    ]) {
      target.setItem(responsibilityPointerKey(scope), raw);
      expect(() => readResponsibilityPointer(target, scope)).toThrow();
    }
  });
  it('does not silently succeed when storage or clear fails', () => {
    const target = storage(),
      pointer: ResponsibilityPointer = { ...scope, command: commands[0]! };
    expect(() => storeResponsibilityPointer({ ...target, setItem: () => {} }, pointer)).toThrow();
    storeResponsibilityPointer(target, pointer);
    expect(() =>
      clearResponsibilityPointer({ ...target, removeItem: () => {} }, pointer),
    ).toThrow();
  });
});
