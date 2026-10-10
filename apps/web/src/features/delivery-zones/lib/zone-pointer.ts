import { deliveryZoneResolutionSchema, deliveryZoneSchema } from '@pos/contracts/delivery-zones';
import { deliveryZoneMessages as text } from '@pos/ui/locales';
import type { ZonePointer, ZoneScope, ZoneStorage } from '../model/delivery-zone.types';
const pointerSchema = deliveryZoneResolutionSchema
  .extend({
    organizationId: deliveryZoneSchema.shape.id,
    actorUserId: deliveryZoneSchema.shape.id,
    zoneId: deliveryZoneSchema.shape.id,
  })
  .strict();
export function zoneStorageKey(scope: ZoneScope) {
  return `pos.delivery-zone:${scope.organizationId}:${scope.actorUserId}:${scope.locationId}`;
}
export function readZonePointer(storage: ZoneStorage, scope: ZoneScope): ZonePointer | null {
  const raw = storage.getItem(zoneStorageKey(scope));
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
export function zoneRecovery(pointer: ZonePointer) {
  return {
    zoneId: pointer.zoneId,
    body: deliveryZoneResolutionSchema.parse({
      locationId: pointer.locationId,
      action: pointer.action,
      requestKey: pointer.requestKey,
    }),
  };
}
function same(left: ZonePointer, right: ZonePointer) {
  return JSON.stringify(zoneRecovery(left)) === JSON.stringify(zoneRecovery(right));
}
export function storeZonePointer(storage: ZoneStorage, pointer: ZonePointer) {
  const current = readZonePointer(storage, pointer);
  if (current && !same(current, pointer)) throw new Error(text.storageConflict);
  storage.setItem(zoneStorageKey(pointer), JSON.stringify(pointerSchema.parse(pointer)));
  const saved = readZonePointer(storage, pointer);
  if (!saved || !same(saved, pointer)) throw new Error(text.storageError);
}
export function clearZonePointer(storage: ZoneStorage, pointer: ZonePointer) {
  const current = readZonePointer(storage, pointer);
  if (!current) return;
  if (!same(current, pointer)) throw new Error(text.storageConflict);
  storage.removeItem(zoneStorageKey(pointer));
  if (storage.getItem(zoneStorageKey(pointer)) !== null) throw new Error(text.storageError);
}
