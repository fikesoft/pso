import { expect, it } from 'vitest';
import type { PackingCommandResult } from '@pos/contracts';
import type { PackingPointer, PackingStorage } from '../model/packing.types';
import {
  clearPackingPointer,
  packingPointerKey,
  readPackingPointer,
  storePackingPointer,
  validatePackingResult,
} from './packing-pointer';

function fixture() {
  const data = new Map<string, string>();
  const storage: PackingStorage = {
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => {
      data.set(key, value);
    },
    removeItem: (key) => {
      data.delete(key);
    },
  };
  const pointer: PackingPointer = {
    organizationId: 'org',
    actorUserId: 'actor',
    locationId: 'location',
    command: {
      action: 'CHECK_ITEM',
      sessionId: '00000000-0000-4000-8000-000000000001',
      requestKey: '00000000-0000-4000-8000-000000000002',
    },
  };
  return { storage, data, pointer };
}
it('recuperarea păstrează numai identitatea, separă contextele și refuză suprascrierea', () => {
  const { storage, data, pointer } = fixture();
  storePackingPointer(storage, pointer);
  expect(readPackingPointer(storage, pointer)).toEqual(pointer);
  for (const patch of [
    { organizationId: 'other' },
    { actorUserId: 'other' },
    { locationId: 'other' },
  ])
    expect(readPackingPointer(storage, { ...pointer, ...patch })).toBeNull();
  expect(data.get(packingPointerKey(pointer))).not.toContain('version');
  expect(() =>
    storePackingPointer(storage, {
      ...pointer,
      command: { ...pointer.command, requestKey: pointer.command.sessionId },
    }),
  ).toThrow();
  clearPackingPointer(storage, pointer);
  expect(readPackingPointer(storage, pointer)).toBeNull();
});
it('referințele corupte sau mutate în alt scope blochează o operație nouă', () => {
  const { storage, data, pointer } = fixture();
  for (const value of [
    '{',
    JSON.stringify({ ...pointer, actorUserId: 'other' }),
    JSON.stringify({ ...pointer, command: { ...pointer.command, packing: 3 } }),
  ]) {
    data.set(packingPointerKey(pointer), value);
    expect(() => readPackingPointer(storage, pointer)).toThrow();
  }
});
it('rezultatul corespunde acțiunii, articolului, valorii și versiunii trimise', () => {
  const { pointer } = fixture();
  const result: PackingCommandResult = {
    ...pointer.command,
    action: 'CHECK_ITEM',
    status: 'PACKING',
    itemId: '00000000-0000-4000-8000-000000000003',
    checked: true,
    expectedVersion: 1,
    version: 2,
    occurredAt: '2026-10-04T00:00:00.000Z',
  };
  const attempt = {
    ...pointer.command,
    action: 'CHECK_ITEM' as const,
    itemId: result.itemId,
    checked: true,
    version: 1,
  };
  expect(() => validatePackingResult(pointer.command, result, attempt)).not.toThrow();
  for (const patch of [
    { sessionId: result.requestKey },
    { requestKey: result.sessionId },
    { itemId: result.sessionId },
    { checked: false },
    { version: 3 },
    { expectedVersion: 0 },
    { occurredAt: 'invalid' },
  ])
    expect(() =>
      validatePackingResult(pointer.command, { ...result, ...patch }, attempt),
    ).toThrow();
  expect(() => validatePackingResult({ ...pointer.command, action: 'COMPLETE' }, result)).toThrow();
});
it('stocarea care nu persistă sau nu șterge referința blochează continuarea', () => {
  const { pointer, storage } = fixture();
  expect(() => storePackingPointer({ ...storage, setItem: () => {} }, pointer)).toThrow();
  storePackingPointer(storage, pointer);
  expect(() => clearPackingPointer({ ...storage, removeItem: () => {} }, pointer)).toThrow();
});
