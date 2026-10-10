import { orderCreationMessages as text } from '@pos/ui/locales';
import type {
  CreationPointerStorage,
  OrderCreationPointer,
  OrderCreationScope,
} from '../model/order-creation.types';
export function creationStorageKey(scope: OrderCreationScope) {
  return `pos.order-creation:${scope.organizationId}:${scope.actorUserId}:${scope.locationId}`;
}
export function readCreationPointer(
  storage: CreationPointerStorage,
  scope: OrderCreationScope,
): OrderCreationPointer | null {
  const raw = storage.getItem(creationStorageKey(scope));
  if (raw === null) return null;
  let value: OrderCreationPointer;
  try {
    value = JSON.parse(raw) as OrderCreationPointer;
  } catch {
    throw new Error(text.invalidPointer);
  }
  if (
    !value ||
    value.organizationId !== scope.organizationId ||
    value.actorUserId !== scope.actorUserId ||
    value.locationId !== scope.locationId ||
    typeof value.requestKey !== 'string' ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value.requestKey)
  )
    throw new Error(text.invalidPointer);
  return value;
}
export function storeCreationPointer(
  storage: CreationPointerStorage,
  pointer: OrderCreationPointer,
) {
  const current = readCreationPointer(storage, pointer);
  if (current && current.requestKey !== pointer.requestKey) throw new Error(text.storageConflict);
  const { organizationId, actorUserId, locationId, requestKey } = pointer;
  storage.setItem(
    creationStorageKey(pointer),
    JSON.stringify({ organizationId, actorUserId, locationId, requestKey }),
  );
  if (readCreationPointer(storage, pointer)?.requestKey !== requestKey)
    throw new Error(text.storageError);
}
export function clearCreationPointer(
  storage: CreationPointerStorage,
  pointer: OrderCreationPointer,
) {
  const current = readCreationPointer(storage, pointer);
  if (!current) return;
  if (current.requestKey !== pointer.requestKey) throw new Error(text.storageConflict);
  storage.removeItem(creationStorageKey(pointer));
  if (storage.getItem(creationStorageKey(pointer)) !== null) throw new Error(text.storageError);
}
