import { courierResolutionSchema, courierSchema } from '@pos/contracts/couriers';
import { courierMessages as text } from '@pos/ui/locales';
import type { CourierPointer, CourierScope, CourierStorage } from '../model/courier.types';
const pointerSchema = courierResolutionSchema
  .extend({
    organizationId: courierSchema.shape.id,
    actorUserId: courierSchema.shape.id,
    courierId: courierSchema.shape.id,
  })
  .strict();
export function courierStorageKey(scope: CourierScope) {
  return `pos.courier:${scope.organizationId}:${scope.actorUserId}:${scope.locationId}`;
}
export function readCourierPointer(
  storage: CourierStorage,
  scope: CourierScope,
): CourierPointer | null {
  const raw = storage.getItem(courierStorageKey(scope));
  if (raw === null) return null;
  try {
    const pointer = pointerSchema.parse(JSON.parse(raw));
    if (
      pointer.organizationId !== scope.organizationId ||
      pointer.actorUserId !== scope.actorUserId ||
      pointer.locationId !== scope.locationId
    )
      throw new Error();
    return pointer;
  } catch {
    throw new Error(text.invalidPointer);
  }
}
export function courierRecovery(pointer: CourierPointer) {
  return {
    courierId: pointer.courierId,
    body: courierResolutionSchema.parse({
      locationId: pointer.locationId,
      action: pointer.action,
      requestKey: pointer.requestKey,
    }),
  };
}
function same(left: CourierPointer, right: CourierPointer) {
  return JSON.stringify(courierRecovery(left)) === JSON.stringify(courierRecovery(right));
}
export function storeCourierPointer(storage: CourierStorage, pointer: CourierPointer) {
  const current = readCourierPointer(storage, pointer);
  if (current && !same(current, pointer)) throw new Error(text.storageConflict);
  storage.setItem(courierStorageKey(pointer), JSON.stringify(pointerSchema.parse(pointer)));
  const saved = readCourierPointer(storage, pointer);
  if (!saved || !same(saved, pointer)) throw new Error(text.storageError);
}
export function clearCourierPointer(storage: CourierStorage, pointer: CourierPointer) {
  const current = readCourierPointer(storage, pointer);
  if (!current) return;
  if (!same(current, pointer)) throw new Error(text.storageConflict);
  storage.removeItem(courierStorageKey(pointer));
  if (storage.getItem(courierStorageKey(pointer)) !== null) throw new Error(text.storageError);
}
