import { randomUUID } from 'node:crypto';
import { expect, it } from 'vitest';
import {
  clearZonePointer,
  readZonePointer,
  storeZonePointer,
  zoneStorageKey,
} from './zone-pointer';
import type { ZonePointer } from '../model/delivery-zone.types';
const pointer = (): ZonePointer => ({
  organizationId: randomUUID(),
  actorUserId: randomUUID(),
  locationId: randomUUID(),
  zoneId: randomUUID(),
  requestKey: randomUUID(),
  action: 'CREATE',
});
function storage() {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => {
      values.set(key, value);
    },
    removeItem: (key: string) => {
      values.delete(key);
    },
  };
}
it('referința este izolată pe organizație/actor/locație și nu păstrează geometria', () => {
  const data = storage(),
    p = pointer();
  storeZonePointer(data, p);
  expect(readZonePointer(data, p)).toEqual(p);
  for (const key of ['organizationId', 'actorUserId', 'locationId'] as const)
    expect(readZonePointer(data, { ...p, [key]: randomUUID() })).toBeNull();
  expect(Object.keys(JSON.parse(data.getItem(zoneStorageKey(p))!)).sort()).toEqual(
    Object.keys(p).sort(),
  );
  clearZonePointer(data, p);
  expect(readZonePointer(data, p)).toBeNull();
});
it('altă intenție nu suprascrie și nu retrage referința neconfirmată', () => {
  const data = storage(),
    p = pointer();
  storeZonePointer(data, p);
  const other = { ...p, zoneId: randomUUID() };
  expect(() => storeZonePointer(data, other)).toThrow();
  expect(() => clearZonePointer(data, other)).toThrow();
  expect(readZonePointer(data, p)).toEqual(p);
});
it('referințele corupte, cu profil atașat sau mutate între actori sunt refuzate', () => {
  const data = storage(),
    p = pointer();
  for (const raw of [
    'broken',
    JSON.stringify({ ...p, profile: { name: 'secret' } }),
    JSON.stringify({ ...p, actorUserId: randomUUID() }),
  ]) {
    data.setItem(zoneStorageKey(p), raw);
    expect(() => readZonePointer(data, p)).toThrow();
  }
});
