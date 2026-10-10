import {
  courierAcceptanceResolutionSchema,
  courierWorkDetailQuerySchema,
} from '@pos/contracts/courier-work';
import { courierWorkMessages as text } from '@pos/ui/locales';
import type {
  AcceptancePointer,
  AcceptanceScope,
  AcceptanceStorage,
} from '../model/courier-acceptance.types';
const pointerSchema = courierAcceptanceResolutionSchema
  .extend({
    organizationId: courierWorkDetailQuerySchema.shape.locationId,
    actorUserId: courierWorkDetailQuerySchema.shape.locationId,
    orderId: courierWorkDetailQuerySchema.shape.locationId,
  })
  .strict();
export function acceptanceStorageKey(scope: AcceptanceScope) {
  return `pos.courier-acceptance:${scope.organizationId}:${scope.actorUserId}:${scope.locationId}`;
}
export function readAcceptancePointer(
  storage: AcceptanceStorage,
  scope: AcceptanceScope,
): AcceptancePointer | null {
  const raw = storage.getItem(acceptanceStorageKey(scope));
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
export function acceptanceRecovery(pointer: AcceptancePointer) {
  return {
    orderId: pointer.orderId,
    body: courierAcceptanceResolutionSchema.parse({
      locationId: pointer.locationId,
      assignmentId: pointer.assignmentId,
      requestKey: pointer.requestKey,
    }),
  };
}
function same(left: AcceptancePointer, right: AcceptancePointer) {
  return JSON.stringify(acceptanceRecovery(left)) === JSON.stringify(acceptanceRecovery(right));
}
export function storeAcceptancePointer(storage: AcceptanceStorage, pointer: AcceptancePointer) {
  const current = readAcceptancePointer(storage, pointer);
  if (current && !same(current, pointer)) throw new Error(text.storageConflict);
  storage.setItem(acceptanceStorageKey(pointer), JSON.stringify(pointerSchema.parse(pointer)));
  const saved = readAcceptancePointer(storage, pointer);
  if (!saved || !same(saved, pointer)) throw new Error(text.storageError);
}
export function clearAcceptancePointer(storage: AcceptanceStorage, pointer: AcceptancePointer) {
  const current = readAcceptancePointer(storage, pointer);
  if (!current) return;
  if (!same(current, pointer)) throw new Error(text.storageConflict);
  storage.removeItem(acceptanceStorageKey(pointer));
  if (storage.getItem(acceptanceStorageKey(pointer)) !== null) throw new Error(text.storageError);
}
