import { addressMessages as text } from '@pos/ui/locales';
import type { AddressPointer } from '../model/draft-address.types';
import type { CreationPointerStorage, OrderCreationScope } from '../model/order-creation.types';
export function addressStorageKey(scope: OrderCreationScope) {
  return `pos.address-attempt:${scope.organizationId}:${scope.actorUserId}:${scope.locationId}`;
}
export function readAddressPointer(
  storage: CreationPointerStorage,
  scope: OrderCreationScope,
): AddressPointer | null {
  const raw = storage.getItem(addressStorageKey(scope));
  if (raw === null) return null;
  let value: AddressPointer;
  try {
    value = JSON.parse(raw) as AddressPointer;
  } catch {
    throw new Error(text.storageError);
  }
  const uuid = (id: unknown) =>
    typeof id === 'string' &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
  if (
    !value ||
    value.organizationId !== scope.organizationId ||
    value.actorUserId !== scope.actorUserId ||
    value.locationId !== scope.locationId ||
    !uuid(value.customerId) ||
    !uuid(value.requestKey) ||
    !['CREATE', 'ARCHIVE'].includes(value.operation) ||
    (value.operation === 'ARCHIVE' &&
      (!uuid(value.addressId) || !Number.isInteger(value.version) || value.version! < 1))
  )
    throw new Error(text.storageError);
  return value;
}
export function storeAddressPointer(storage: CreationPointerStorage, pointer: AddressPointer) {
  const current = readAddressPointer(storage, pointer);
  if (current && JSON.stringify(current) !== JSON.stringify(pointer))
    throw new Error(text.storageError);
  const {
    organizationId,
    actorUserId,
    locationId,
    customerId,
    requestKey,
    operation,
    addressId,
    version,
  } = pointer;
  const safe = {
    organizationId,
    actorUserId,
    locationId,
    customerId,
    requestKey,
    operation,
    ...(operation === 'ARCHIVE' ? { addressId, version } : {}),
  };
  storage.setItem(addressStorageKey(pointer), JSON.stringify(safe));
  if (JSON.stringify(readAddressPointer(storage, pointer)) !== JSON.stringify(safe))
    throw new Error(text.storageError);
}
export function clearAddressPointer(storage: CreationPointerStorage, pointer: AddressPointer) {
  const current = readAddressPointer(storage, pointer);
  if (!current) return;
  if (
    current.requestKey !== pointer.requestKey ||
    current.operation !== pointer.operation ||
    current.customerId !== pointer.customerId
  )
    throw new Error(text.storageError);
  storage.removeItem(addressStorageKey(pointer));
  if (storage.getItem(addressStorageKey(pointer)) !== null) throw new Error(text.storageError);
}
