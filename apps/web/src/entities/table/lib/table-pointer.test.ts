import { randomUUID } from 'node:crypto';
import { expect, it } from 'vitest';
import {
  clearTablePointer,
  readTablePointer,
  storeTablePointer,
  tablePointerKey,
} from './table-pointer';
import type { TablePointer, TableStorage } from '../model/table-operation.types';

function fixture() {
  const rows = new Map<string, string>();
  const storage: TableStorage = {
    getItem: (key) => rows.get(key) ?? null,
    setItem: (key, value) => {
      rows.set(key, value);
    },
    removeItem: (key) => {
      rows.delete(key);
    },
  };
  const pointer: TablePointer = {
    organizationId: randomUUID(),
    actorUserId: randomUUID(),
    locationId: randomUUID(),
    family: 'TABLE',
    command: { kind: 'CREATE', locationId: '', requestKey: randomUUID() },
  };
  pointer.command.locationId = pointer.locationId;
  return { storage, pointer, rows };
}

it('recuperarea meselor izolează actorul, organizația, locația și familia operației', () => {
  const { storage, pointer } = fixture();
  storeTablePointer(storage, pointer);
  expect(readTablePointer(storage, pointer, 'TABLE')).toEqual(pointer);
  expect(readTablePointer(storage, pointer, 'VISIT')).toBeNull();
  for (const field of ['organizationId', 'actorUserId', 'locationId'] as const)
    expect(readTablePointer(storage, { ...pointer, [field]: randomUUID() }, 'TABLE')).toBeNull();
});

it('o cerere nouă nu suprascrie și nu șterge tentativa incertă existentă', () => {
  const { storage, pointer } = fixture();
  storeTablePointer(storage, pointer);
  const other: TablePointer = {
    ...pointer,
    command: { ...pointer.command, requestKey: randomUUID() },
  };
  expect(() => storeTablePointer(storage, other)).toThrow();
  expect(() => clearTablePointer(storage, other)).toThrow();
  expect(readTablePointer(storage, pointer, 'TABLE')).toEqual(pointer);
  clearTablePointer(storage, pointer);
  expect(readTablePointer(storage, pointer, 'TABLE')).toBeNull();
});

it('pointerii alterați și scrierea fără persistență sunt refuzate', () => {
  const { storage, pointer, rows } = fixture();
  const key = tablePointerKey(pointer, 'TABLE');
  rows.set(
    key,
    JSON.stringify({ ...pointer, command: { ...pointer.command, locationId: randomUUID() } }),
  );
  expect(() => readTablePointer(storage, pointer, 'TABLE')).toThrow();
  rows.clear();
  expect(() => storeTablePointer({ ...storage, setItem: () => {} }, pointer)).toThrow();
});

it('recuperarea unirii păstrează destinația și refuză înlocuirea ei', () => {
  const { storage, pointer } = fixture();
  const merged: TablePointer = {
    ...pointer,
    family: 'VISIT',
    command: {
      kind: 'MERGED',
      locationId: pointer.locationId,
      requestKey: randomUUID(),
      visitId: randomUUID(),
      targetVisitId: randomUUID(),
    },
  };
  storeTablePointer(storage, merged);
  expect(readTablePointer(storage, merged, 'VISIT')).toEqual(merged);
  if (merged.command.kind !== 'MERGED') throw new Error('Fixture de unire invalid');
  const changed: TablePointer = {
    ...merged,
    command: { ...merged.command, targetVisitId: randomUUID() },
  };
  expect(() => storeTablePointer(storage, changed)).toThrow();
  expect(() => clearTablePointer(storage, changed)).toThrow();
  expect(readTablePointer(storage, merged, 'VISIT')).toEqual(merged);
});
