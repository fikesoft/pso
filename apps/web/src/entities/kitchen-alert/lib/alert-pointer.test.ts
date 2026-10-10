import { expect, it } from 'vitest';
import {
  alertPointerKey,
  clearAlertPointer,
  readAlertPointer,
  storeAlertPointer,
  validateAlertResult,
} from './alert-pointer';
import type { AlertPointer, AlertStorage } from '../model/alert.types';
function fixture() {
  const data = new Map<string, string>();
  const storage: AlertStorage = {
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => {
      data.set(key, value);
    },
    removeItem: (key) => {
      data.delete(key);
    },
  };
  const pointer: AlertPointer = {
    organizationId: 'organization',
    actorUserId: 'actor',
    locationId: '00000000-0000-4000-8000-000000000001',
    command: {
      scope: { scopeType: 'ORGANIZATION' },
      target: { kind: 'DEFAULT' },
      requestKey: '00000000-0000-4000-8000-000000000002',
    },
  };
  return { storage, data, pointer };
}
it('păstrează numai identitatea tentativei, separă actorul/locația și refuză suprascrierea', () => {
  const { storage, data, pointer } = fixture();
  storeAlertPointer(storage, pointer);
  expect(readAlertPointer(storage, pointer)).toEqual(pointer);
  expect(readAlertPointer(storage, { ...pointer, actorUserId: 'other' })).toBeNull();
  expect(readAlertPointer(storage, { ...pointer, locationId: 'other' })).toBeNull();
  expect(() =>
    storeAlertPointer(storage, {
      ...pointer,
      command: { ...pointer.command, requestKey: '00000000-0000-4000-8000-000000000003' },
    }),
  ).toThrow();
  expect(data.get(alertPointerKey(pointer))).not.toContain('thresholds');
  clearAlertPointer(storage, pointer);
  expect(readAlertPointer(storage, pointer)).toBeNull();
});
it('respinge o referință coruptă sau locală mutată în alt context', () => {
  const { storage, data, pointer } = fixture();
  data.set(alertPointerKey(pointer), '{');
  expect(() => readAlertPointer(storage, pointer)).toThrow();
  data.set(
    alertPointerKey(pointer),
    JSON.stringify({
      ...pointer,
      command: {
        ...pointer.command,
        scope: { scopeType: 'LOCATION', locationId: '00000000-0000-4000-8000-000000000009' },
      },
    }),
  );
  expect(() => readAlertPointer(storage, pointer)).toThrow();
});
it('validează identitatea și versiunea rezultatului înainte de a șterge tentativa', () => {
  const { pointer } = fixture();
  const rule = {
    scope: pointer.command.scope,
    target: pointer.command.target,
    version: 1,
    thresholds: null,
  };
  expect(() => validateAlertResult(pointer.command, rule, 0)).not.toThrow();
  expect(() => validateAlertResult(pointer.command, rule, 1)).toThrow();
  expect(() => validateAlertResult(pointer.command, { ...rule, version: 0 })).toThrow();
  expect(() =>
    validateAlertResult(pointer.command, {
      ...rule,
      thresholds: { warningSeconds: 30, criticalSeconds: 20 },
    }),
  ).toThrow();
  expect(() =>
    validateAlertResult(pointer.command, {
      ...rule,
      scope: { scopeType: 'LOCATION', locationId: pointer.locationId },
    }),
  ).toThrow();
});
