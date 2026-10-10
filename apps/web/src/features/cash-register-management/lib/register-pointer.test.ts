import { describe, expect, it } from 'vitest';
import {
  clearRegisterPointer,
  readRegisterPointer,
  registerStorageKey,
  storeRegisterPointer,
} from './register-pointer';
import type { RegisterPointer, RegisterStorage } from '../model/register-management.types';
function pointer(): RegisterPointer {
  return {
    organizationId: 'org',
    actorUserId: 'actor',
    locationId: '33333333-3333-4333-8333-333333333333',
    requestKey: '44444444-4444-4444-8444-444444444444',
    kind: 'CREATE',
  };
}
function storage(): RegisterStorage {
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
describe('cash register recovery pointer', () => {
  it('stores only scope and command identity, never a request body or label', () => {
    const target = storage();
    const value = {
      ...pointer(),
      name: 'Private name',
      code: 'PRIVATE',
      body: { name: 'Private name' },
    };
    storeRegisterPointer(target, value);
    expect(JSON.parse(target.getItem(registerStorageKey(value))!)).toEqual(pointer());
    expect(readRegisterPointer(target, value)).toEqual(pointer());
  });
  it('isolates organization, actor and location, retaining the original pointer', () => {
    const target = storage();
    const value = pointer();
    storeRegisterPointer(target, value);
    for (const scope of [
      { ...value, organizationId: 'other' },
      { ...value, actorUserId: 'other' },
      { ...value, locationId: '55555555-5555-4555-8555-555555555555' },
    ])
      expect(readRegisterPointer(target, scope)).toBeNull();
    expect(readRegisterPointer(target, value)).toEqual(value);
  });
  it('rejects corrupted, foreign or unexpectedly enriched stored pointers', () => {
    const target = storage();
    const value = pointer();
    for (const raw of [
      '{',
      JSON.stringify({ ...value, actorUserId: 'foreign' }),
      JSON.stringify({ ...value, requestKey: 'invalid' }),
      JSON.stringify({ ...value, name: 'not allowed' }),
    ]) {
      target.setItem(registerStorageKey(value), raw);
      expect(() => readRegisterPointer(target, value)).toThrow();
    }
  });
  it('does not replace or clear a different operation or key', () => {
    const target = storage();
    const value = pointer();
    storeRegisterPointer(target, value);
    for (const other of [
      { ...value, requestKey: '55555555-5555-4555-8555-555555555555' },
      { ...value, kind: 'ARCHIVE', registerId: '66666666-6666-4666-8666-666666666666' },
    ] as RegisterPointer[]) {
      expect(() => storeRegisterPointer(target, other)).toThrow();
      expect(() => clearRegisterPointer(target, other)).toThrow();
    }
    expect(readRegisterPointer(target, value)).toEqual(value);
  });
  it('requires the exact update target and roundtrips rename and archive', () => {
    const target = storage();
    for (const kind of ['RENAME', 'ARCHIVE'] as const) {
      const value: RegisterPointer = {
        ...pointer(),
        kind,
        registerId: '66666666-6666-4666-8666-666666666666',
      };
      storeRegisterPointer(target, value);
      expect(readRegisterPointer(target, value)).toEqual(value);
      expect(() =>
        clearRegisterPointer(target, {
          ...value,
          kind,
          registerId: '77777777-7777-4777-8777-777777777777',
        }),
      ).toThrow();
      clearRegisterPointer(target, value);
      expect(readRegisterPointer(target, value)).toBeNull();
    }
  });
  it('fails closed when storage silently ignores persistence or removal', () => {
    const target = storage();
    const value = pointer();
    expect(() => storeRegisterPointer({ ...target, setItem: () => {} }, value)).toThrow();
    storeRegisterPointer(target, value);
    expect(() => clearRegisterPointer({ ...target, removeItem: () => {} }, value)).toThrow();
  });
});
