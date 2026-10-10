import { randomUUID } from 'node:crypto';
import { expect, it } from 'vitest';
import {
  clearBillPointer,
  readBillPointer,
  storeBillPointer,
  billPointerKey,
} from './bill-pointer';
import type { BillPointer, BillStorage } from '../model/bill-operation.types';

function fixture() {
  const rows = new Map<string, string>();
  const storage: BillStorage = {
    getItem: (key) => rows.get(key) ?? null,
    setItem: (key, value) => {
      rows.set(key, value);
    },
    removeItem: (key) => {
      rows.delete(key);
    },
  };
  const pointer: BillPointer = {
    organizationId: randomUUID(),
    actorUserId: randomUUID(),
    locationId: randomUUID(),
    family: 'PLAN',
    command: {
      kind: 'CREATE',
      locationId: '',
      requestKey: randomUUID(),
      context: { kind: 'ORDER', id: randomUUID() },
    },
  };
  pointer.command.locationId = pointer.locationId;
  return { storage, pointer, rows };
}

it('recuperarea notei izolează actorul, organizația, locația și familia operației', () => {
  const { storage, pointer } = fixture();
  storeBillPointer(storage, pointer);
  expect(readBillPointer(storage, pointer, 'PLAN')).toEqual(pointer);
  expect(readBillPointer(storage, pointer, 'COLLECTION')).toBeNull();
  for (const field of ['organizationId', 'actorUserId', 'locationId'] as const)
    expect(readBillPointer(storage, { ...pointer, [field]: randomUUID() }, 'PLAN')).toBeNull();
});

it('o cerere nouă nu suprascrie și nu șterge tentativa incertă existentă', () => {
  const { storage, pointer } = fixture();
  storeBillPointer(storage, pointer);
  const other: BillPointer = {
    ...pointer,
    command: { ...pointer.command, requestKey: randomUUID() },
  };
  expect(() => storeBillPointer(storage, other)).toThrow();
  expect(() => clearBillPointer(storage, other)).toThrow();
  expect(readBillPointer(storage, pointer, 'PLAN')).toEqual(pointer);
  clearBillPointer(storage, pointer);
  expect(readBillPointer(storage, pointer, 'PLAN')).toBeNull();
});

it('pointerii alterați și scrierea fără persistență sunt refuzate', () => {
  const { storage, pointer, rows } = fixture();
  const key = billPointerKey(pointer, 'PLAN');
  rows.set(
    key,
    JSON.stringify({ ...pointer, command: { ...pointer.command, locationId: randomUUID() } }),
  );
  expect(() => readBillPointer(storage, pointer, 'PLAN')).toThrow();
  rows.clear();
  expect(() => storeBillPointer({ ...storage, setItem: () => {} }, pointer)).toThrow();
});

it('pointerul financiar nu persistă sumele, sursele, motivul sau payloadul', () => {
  const { storage, pointer, rows } = fixture();
  const collection: BillPointer = {
    ...pointer,
    family: 'COLLECTION',
    command: { locationId: pointer.locationId, requestKey: randomUUID(), partId: randomUUID() },
  };
  storeBillPointer(storage, {
    ...collection,
    amount: '100',
    reason: 'Privat',
    body: { sources: ['secret'] },
  } as BillPointer);
  const raw = rows.get(billPointerKey(collection, 'COLLECTION'))!;
  expect(JSON.parse(raw)).toEqual(collection);
  expect(raw).not.toContain('secret');
  const malformed = { ...collection, command: { ...collection.command, amount: '100' } };
  rows.set(billPointerKey(collection, 'COLLECTION'), JSON.stringify(malformed));
  expect(() => readBillPointer(storage, collection, 'COLLECTION')).toThrow();
});
