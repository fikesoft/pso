import {
  addressManagementIdentitySchema,
  addressManagementResolutionSchema,
} from '@pos/contracts/address-management';
import { cashRecoveryMessages as text } from '@pos/ui/locales';
import type {
  AddressBookIdentity,
  AddressBookPointer,
  AddressBookScope,
  AddressBookStorage,
} from '../model/address-management.types';
export function addressBookPointerKey(scope: AddressBookScope) {
  return `pos.address-book:${scope.organizationId}:${scope.actorUserId}:${scope.locationId}:${scope.customerId}`;
}
export function addressBookIdentity(value: AddressBookIdentity): AddressBookIdentity {
  if (value.action !== 'CREATE') return addressManagementIdentitySchema.parse(value);
  const { action, ...identity } = value;
  return { action, ...addressManagementResolutionSchema.omit({ action: true }).parse(identity) };
}
export function sameAddressBookIdentity(a: AddressBookIdentity, b: AddressBookIdentity) {
  return JSON.stringify(addressBookIdentity(a)) === JSON.stringify(addressBookIdentity(b));
}
export function readAddressBookPointer(
  storage: AddressBookStorage,
  scope: AddressBookScope,
): AddressBookPointer | null {
  const raw = storage.getItem(addressBookPointerKey(scope));
  if (raw === null) return null;
  try {
    const value = JSON.parse(raw);
    if (
      Object.keys(value).sort().join(',') !==
        'actorUserId,command,customerId,locationId,organizationId' ||
      value.organizationId !== scope.organizationId ||
      value.actorUserId !== scope.actorUserId ||
      value.locationId !== scope.locationId ||
      value.customerId !== scope.customerId ||
      value.command.locationId !== scope.locationId
    )
      throw new Error(text.invalid);
    return { ...scope, command: addressBookIdentity(value.command) };
  } catch {
    throw new Error(text.invalid);
  }
}
export function storeAddressBookPointer(storage: AddressBookStorage, pointer: AddressBookPointer) {
  const previous = readAddressBookPointer(storage, pointer);
  if (previous && !sameAddressBookIdentity(previous.command, pointer.command))
    throw new Error(text.conflict);
  const safe = {
    organizationId: pointer.organizationId,
    actorUserId: pointer.actorUserId,
    locationId: pointer.locationId,
    customerId: pointer.customerId,
    command: addressBookIdentity(pointer.command),
  };
  if (safe.command.locationId !== safe.locationId) throw new Error(text.invalid);
  storage.setItem(addressBookPointerKey(pointer), JSON.stringify(safe));
  const stored = readAddressBookPointer(storage, pointer);
  if (!stored || !sameAddressBookIdentity(stored.command, pointer.command))
    throw new Error(text.storage);
}
export function clearAddressBookPointer(storage: AddressBookStorage, pointer: AddressBookPointer) {
  const previous = readAddressBookPointer(storage, pointer);
  if (previous && !sameAddressBookIdentity(previous.command, pointer.command))
    throw new Error(text.conflict);
  storage.removeItem(addressBookPointerKey(pointer));
  if (storage.getItem(addressBookPointerKey(pointer)) !== null) throw new Error(text.storage);
}
