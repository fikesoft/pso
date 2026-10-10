import { expect, it } from 'vitest';
import type { AddressBookPointer, AddressBookStorage } from '../model/address-management.types';
import {
  addressBookPointerKey,
  clearAddressBookPointer,
  readAddressBookPointer,
  storeAddressBookPointer,
} from './address-book-pointer';
function fixture() {
  const data = new Map<string, string>();
  const storage: AddressBookStorage = {
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => {
      data.set(key, value);
    },
    removeItem: (key) => {
      data.delete(key);
    },
  };
  const pointer: AddressBookPointer = {
    organizationId: 'org',
    actorUserId: 'actor',
    locationId: '00000000-0000-4000-8000-000000000001',
    customerId: '00000000-0000-4000-8000-000000000002',
    command: {
      action: 'UPDATE',
      locationId: '00000000-0000-4000-8000-000000000001',
      requestKey: '00000000-0000-4000-8000-000000000003',
      addressId: '00000000-0000-4000-8000-000000000004',
    },
  };
  return { data, storage, pointer };
}
it('pointerul adresarului păstrează numai identitatea și separă inclusiv clienții', () => {
  const { data, storage, pointer } = fixture();
  storeAddressBookPointer(storage, {
    ...pointer,
    profile: { address: 'Adresă personală' },
  } as AddressBookPointer);
  expect(readAddressBookPointer(storage, pointer)).toEqual(pointer);
  expect(data.get(addressBookPointerKey(pointer))).not.toContain('personală');
  for (const change of [
    { organizationId: 'other' },
    { actorUserId: 'other' },
    { locationId: 'other' },
    { customerId: 'other' },
  ])
    expect(readAddressBookPointer(storage, { ...pointer, ...change })).toBeNull();
  const other = { ...pointer, command: { ...pointer.command, requestKey: pointer.customerId } };
  expect(() => storeAddressBookPointer(storage, other)).toThrow();
  expect(() => clearAddressBookPointer(storage, other)).toThrow();
  clearAddressBookPointer(storage, pointer);
  expect(readAddressBookPointer(storage, pointer)).toBeNull();
});
it('tentativa de creare nu persistă profil sau versiune și respinge conținutul injectat', () => {
  const { pointer, storage, data } = fixture();
  const create: AddressBookPointer = {
    ...pointer,
    command: {
      action: 'CREATE',
      locationId: pointer.locationId,
      requestKey: pointer.command.requestKey,
    },
  };
  storeAddressBookPointer(storage, create);
  expect(readAddressBookPointer(storage, pointer)).toEqual(create);
  for (const raw of [
    'null',
    '{',
    JSON.stringify({ ...create, command: { ...create.command, profile: { address: 'A' } } }),
    JSON.stringify({ ...pointer, command: { ...pointer.command, locationId: pointer.customerId } }),
  ]) {
    data.set(addressBookPointerKey(pointer), raw);
    expect(() => readAddressBookPointer(storage, pointer)).toThrow();
  }
});
it('storage care nu persistă ori nu șterge pointerul blochează continuarea', () => {
  const { storage, pointer } = fixture();
  expect(() => storeAddressBookPointer({ ...storage, setItem: () => {} }, pointer)).toThrow();
  storeAddressBookPointer(storage, pointer);
  expect(() => clearAddressBookPointer({ ...storage, removeItem: () => {} }, pointer)).toThrow();
});
