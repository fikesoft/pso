import { describe, expect, it } from 'vitest';
import type { CashCommandIdentity } from '@pos/contracts';
import type { CashCommandPointer, CashPointerStorage } from '../model/cash-command.types';
import {
  cashPointerKey,
  clearCashPointer,
  readCashPointer,
  sameCashCommand,
  storeCashPointer,
} from './cash-pointer';
function pointer(): CashCommandPointer {
  return {
    organizationId: 'organization',
    actorUserId: 'actor',
    locationId: '11111111-1111-4111-8111-111111111111',
    command: {
      kind: 'COLLECT',
      locationId: '11111111-1111-4111-8111-111111111111',
      requestKey: '22222222-2222-4222-8222-222222222222',
      orderId: '33333333-3333-4333-8333-333333333333',
    },
  };
}
function storage(): CashPointerStorage {
  const values = new Map<string, string>();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => {
      values.set(key, value);
    },
    removeItem: (key) => {
      values.delete(key);
    },
  };
}
describe('cash command pointer identity', () => {
  it('persists only scope and command identity and separates channels', () => {
    const target = storage(),
      value = { ...pointer(), amount: '100', name: 'not persisted' };
    storeCashPointer(target, value, 'FINANCIAL');
    expect(JSON.parse(target.getItem(cashPointerKey(value, 'FINANCIAL'))!)).toEqual(pointer());
    expect(readCashPointer(target, value, 'CASH')).toBeNull();
    expect(readCashPointer(target, value, 'FINANCIAL')).toEqual(pointer());
  });
  it('rejects a channel/kind mismatch before persisting anything', () => {
    const target = storage(),
      value = pointer();
    expect(() => storeCashPointer(target, value, 'CASH')).toThrow();
    expect(target.getItem(cashPointerKey(value, 'CASH'))).toBeNull();
  });
  it('keeps org, actor and location isolated', () => {
    const target = storage(),
      value = pointer();
    storeCashPointer(target, value, 'FINANCIAL');
    for (const scope of [
      { ...value, organizationId: 'other' },
      { ...value, actorUserId: 'other' },
      { ...value, locationId: '44444444-4444-4444-8444-444444444444' },
    ])
      expect(readCashPointer(target, scope, 'FINANCIAL')).toBeNull();
    expect(readCashPointer(target, value, 'FINANCIAL')).toEqual(value);
  });
  it('requires the exact kind, location, target and request key to clear', () => {
    const target = storage(),
      value = pointer();
    storeCashPointer(target, value, 'FINANCIAL');
    for (const change of [
      { kind: 'REFUND' },
      { kind: 'CHECKOUT_MANUAL' },
      { orderId: '44444444-4444-4444-8444-444444444444' },
      { requestKey: '44444444-4444-4444-8444-444444444444' },
    ]) {
      const command = { ...value.command, ...change } as CashCommandIdentity;
      expect(sameCashCommand(value.command, command)).toBe(false);
      expect(() => clearCashPointer(target, { ...value, command }, 'FINANCIAL')).toThrow();
    }
    expect(readCashPointer(target, value, 'FINANCIAL')).toEqual(value);
  });
  it('roundtrips all CASH kinds with distinct typed targets', () => {
    const target = storage(),
      value = pointer();
    const base = { locationId: value.locationId, requestKey: value.command.requestKey };
    for (const command of [
      { ...base, kind: 'OPEN', registerId: '44444444-4444-4444-8444-444444444444' },
      { ...base, kind: 'CLOSE', shiftId: '55555555-5555-4555-8555-555555555555' },
      { ...base, kind: 'CASH_IN', shiftId: '55555555-5555-4555-8555-555555555555' },
      { ...base, kind: 'CASH_OUT', shiftId: '55555555-5555-4555-8555-555555555555' },
    ] as CashCommandIdentity[]) {
      const cash = { ...value, command };
      expect(() => storeCashPointer(target, cash, 'FINANCIAL')).toThrow();
      storeCashPointer(target, cash, 'CASH');
      expect(readCashPointer(target, cash, 'CASH')).toEqual(cash);
      clearCashPointer(target, cash, 'CASH');
      expect(readCashPointer(target, cash, 'CASH')).toBeNull();
    }
  });
  it('does not reuse a pending movement key for another CASH kind', () => {
    const target = storage(),
      value = pointer();
    const command = {
      kind: 'CASH_IN' as const,
      locationId: value.locationId,
      requestKey: value.command.requestKey,
      shiftId: '55555555-5555-4555-8555-555555555555',
    };
    const cash = { ...value, command };
    storeCashPointer(target, cash, 'CASH');
    for (const kind of ['CASH_OUT', 'CLOSE'] as const) {
      expect(() =>
        storeCashPointer(target, { ...cash, command: { ...command, kind } }, 'CASH'),
      ).toThrow();
      expect(() =>
        clearCashPointer(target, { ...cash, command: { ...command, kind } }, 'CASH'),
      ).toThrow();
    }
    expect(readCashPointer(target, cash, 'CASH')).toEqual(cash);
  });
  it('rejects corrupt data and command payload enrichment', () => {
    const target = storage(),
      value = pointer();
    for (const raw of [
      '{',
      JSON.stringify({ ...value, actorUserId: 'other' }),
      JSON.stringify({ ...value, command: { ...value.command, amount: '10.00' } }),
    ]) {
      target.setItem(cashPointerKey(value, 'FINANCIAL'), raw);
      expect(() => readCashPointer(target, value, 'FINANCIAL')).toThrow();
    }
  });
  it('fails closed when persistence or clear silently fails', () => {
    const target = storage(),
      value = pointer();
    expect(() => storeCashPointer({ ...target, setItem: () => {} }, value, 'FINANCIAL')).toThrow();
    storeCashPointer(target, value, 'FINANCIAL');
    expect(() =>
      clearCashPointer({ ...target, removeItem: () => {} }, value, 'FINANCIAL'),
    ).toThrow();
  });
});
