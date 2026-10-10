import { expect, it } from 'vitest';
import {
  addressStorageKey,
  clearAddressPointer,
  readAddressPointer,
  storeAddressPointer,
} from './address-pointer';
import type { AddressPointer } from '../model/draft-address.types';
function fixture() {
  const values = new Map<string, string>();
  const storage = {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => {
      values.set(key, value);
    },
    removeItem: (key: string) => {
      values.delete(key);
    },
  };
  const pointer: AddressPointer = {
    organizationId: 'org',
    actorUserId: 'actor',
    locationId: 'location',
    customerId: '00000000-0000-4000-8000-000000000001',
    requestKey: '00000000-0000-4000-8000-000000000002',
    operation: 'CREATE',
  };
  return { storage, values, pointer };
}
it('persists only opaque recovery identifiers and reconstructs archive replay after reload', () => {
  const { storage, values, pointer } = fixture();
  storeAddressPointer(storage, {
    ...pointer,
    address: 'Private',
    instructions: 'Private',
  } as AddressPointer);
  expect(JSON.parse(values.get(addressStorageKey(pointer))!)).toEqual(pointer);
  clearAddressPointer(storage, pointer);
  const archive: AddressPointer = {
    ...pointer,
    operation: 'ARCHIVE',
    addressId: '00000000-0000-4000-8000-000000000003',
    version: 1,
  };
  storeAddressPointer(storage, archive);
  expect(readAddressPointer(storage, pointer)).toEqual(archive);
});
it('isolates actor/location and refuses replacing or clearing another customer attempt', () => {
  const { storage, pointer } = fixture();
  storeAddressPointer(storage, pointer);
  expect(readAddressPointer(storage, { ...pointer, actorUserId: 'other' })).toBeNull();
  expect(readAddressPointer(storage, { ...pointer, locationId: 'other' })).toBeNull();
  const other = { ...pointer, customerId: '00000000-0000-4000-8000-000000000004' };
  expect(() => storeAddressPointer(storage, other)).toThrow();
  expect(() => clearAddressPointer(storage, other)).toThrow();
  expect(readAddressPointer(storage, pointer)).toEqual(pointer);
});
it('fails closed on dropped writes/removals or malformed archive replay data', () => {
  const { storage, pointer, values } = fixture();
  expect(() => storeAddressPointer({ ...storage, setItem: () => {} }, pointer)).toThrow();
  storeAddressPointer(storage, pointer);
  expect(() => clearAddressPointer({ ...storage, removeItem: () => {} }, pointer)).toThrow();
  values.set(
    addressStorageKey(pointer),
    JSON.stringify({ ...pointer, operation: 'ARCHIVE', version: 0 }),
  );
  expect(() => readAddressPointer(storage, pointer)).toThrow();
});
