import { deliveryResolutionSchema } from '@pos/contracts/delivery';
import { courierWorkDetailQuerySchema } from '@pos/contracts/courier-work';
import { courierWorkMessages as text } from '@pos/ui/locales';
import type {
  TransitionPointer,
  TransitionScope,
  TransitionStorage,
} from '../model/courier-transition.types';
const pointerSchema = deliveryResolutionSchema
  .extend({
    organizationId: courierWorkDetailQuerySchema.shape.locationId,
    actorUserId: courierWorkDetailQuerySchema.shape.locationId,
    orderId: courierWorkDetailQuerySchema.shape.locationId,
  })
  .strict();
export function transitionStorageKey(scope: TransitionScope) {
  return `pos.courier-transition:${scope.organizationId}:${scope.actorUserId}:${scope.locationId}`;
}
export function readTransitionPointer(
  storage: TransitionStorage,
  scope: TransitionScope,
): TransitionPointer | null {
  const raw = storage.getItem(transitionStorageKey(scope));
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
export function transitionRecovery(pointer: TransitionPointer) {
  return {
    orderId: pointer.orderId,
    body: deliveryResolutionSchema.parse({
      locationId: pointer.locationId,
      status: pointer.status,
      requestKey: pointer.requestKey,
    }),
  };
}
function same(left: TransitionPointer, right: TransitionPointer) {
  return JSON.stringify(transitionRecovery(left)) === JSON.stringify(transitionRecovery(right));
}
export function storeTransitionPointer(storage: TransitionStorage, pointer: TransitionPointer) {
  const current = readTransitionPointer(storage, pointer);
  if (current && !same(current, pointer)) throw new Error(text.storageConflict);
  storage.setItem(transitionStorageKey(pointer), JSON.stringify(pointerSchema.parse(pointer)));
  const saved = readTransitionPointer(storage, pointer);
  if (!saved || !same(saved, pointer)) throw new Error(text.storageError);
}
export function clearTransitionPointer(storage: TransitionStorage, pointer: TransitionPointer) {
  const current = readTransitionPointer(storage, pointer);
  if (!current) return;
  if (!same(current, pointer)) throw new Error(text.storageConflict);
  storage.removeItem(transitionStorageKey(pointer));
  if (storage.getItem(transitionStorageKey(pointer)) !== null) throw new Error(text.storageError);
}
