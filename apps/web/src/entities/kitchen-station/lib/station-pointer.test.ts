import { randomUUID } from 'node:crypto';
import { expect, it } from 'vitest';
import {
  clearStationPointer,
  readStationPointer,
  storeStationPointer,
  stationPointerKey,
} from './station-pointer';
import type { StationPointer, StationStorage } from '../model/station-operation.types';

function fixture() {
  const rows = new Map<string, string>();
  const storage: StationStorage = {
    getItem: (key) => rows.get(key) ?? null,
    setItem: (key, value) => {
      rows.set(key, value);
    },
    removeItem: (key) => {
      rows.delete(key);
    },
  };
  const pointer: StationPointer = {
    organizationId: randomUUID(),
    actorUserId: randomUUID(),
    locationId: randomUUID(),
    family: 'STATION',
    command: { kind: 'CREATE', locationId: '', requestKey: randomUUID() },
  };
  pointer.command.locationId = pointer.locationId;
  return { storage, pointer, rows };
}

it('rutarea persistă doar identitatea și nu se confundă cu o comandă de stație', () => {
  const { storage, pointer, rows } = fixture();
  const routing: StationPointer = {
    ...pointer,
    family: 'ROUTING',
    command: { locationId: pointer.locationId, productId: randomUUID(), requestKey: randomUUID() },
  };
  storeStationPointer(storage, routing);
  expect(readStationPointer(storage, routing, 'ROUTING')).toEqual(routing);
  expect(readStationPointer(storage, routing, 'STATION')).toBeNull();
  const key = stationPointerKey(routing, 'ROUTING');
  const saved = JSON.parse(rows.get(key)!);
  expect(Object.keys(saved.command).sort()).toEqual(['locationId', 'productId', 'requestKey']);
  rows.set(
    key,
    JSON.stringify({ ...saved, command: { ...saved.command, stationId: randomUUID() } }),
  );
  expect(() => readStationPointer(storage, routing, 'ROUTING')).toThrow();
});

it('recuperarea stațiilor izolează actorul, organizația, locația și familia operației', () => {
  const { storage, pointer } = fixture();
  storeStationPointer(storage, pointer);
  expect(readStationPointer(storage, pointer, 'STATION')).toEqual(pointer);
  for (const field of ['organizationId', 'actorUserId', 'locationId'] as const)
    expect(
      readStationPointer(storage, { ...pointer, [field]: randomUUID() }, 'STATION'),
    ).toBeNull();
});

it('o cerere nouă nu suprascrie și nu șterge tentativa incertă existentă', () => {
  const { storage, pointer } = fixture();
  storeStationPointer(storage, pointer);
  const other: StationPointer = {
    ...pointer,
    command: { ...pointer.command, requestKey: randomUUID() },
  };
  expect(() => storeStationPointer(storage, other)).toThrow();
  expect(() => clearStationPointer(storage, other)).toThrow();
  expect(readStationPointer(storage, pointer, 'STATION')).toEqual(pointer);
  clearStationPointer(storage, pointer);
  expect(readStationPointer(storage, pointer, 'STATION')).toBeNull();
});

it('pointerii alterați și scrierea fără persistență sunt refuzate', () => {
  const { storage, pointer, rows } = fixture();
  const key = stationPointerKey(pointer, 'STATION');
  rows.set(
    key,
    JSON.stringify({ ...pointer, command: { ...pointer.command, locationId: randomUUID() } }),
  );
  expect(() => readStationPointer(storage, pointer, 'STATION')).toThrow();
  rows.clear();
  expect(() => storeStationPointer({ ...storage, setItem: () => {} }, pointer)).toThrow();
});

it('pointerul exclude denumirea și corpul tentativei', () => {
  const { storage, pointer, rows } = fixture();
  storeStationPointer(storage, {
    ...pointer,
    name: 'Denumire privată',
    body: { name: 'Secret' },
  } as StationPointer);
  const raw = rows.get(stationPointerKey(pointer, 'STATION'))!;
  expect(raw).not.toContain('Secret');
  expect(raw).not.toContain('Denumire privată');
});
