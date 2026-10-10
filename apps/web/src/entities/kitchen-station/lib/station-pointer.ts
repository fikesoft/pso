import {
  kitchenStationResolutionSchema,
  kitchenRoutingIdentitySchema,
} from '@pos/contracts/kitchen-stations';
import { cashRecoveryMessages as text } from '@pos/ui/locales';
import type {
  StationPointer,
  StationOperationIdentity,
  StationScope,
  StationStorage,
} from '../model/station-operation.types';
export function canonicalStationIdentity(
  value: StationOperationIdentity,
): StationOperationIdentity {
  if (value.family === 'STATION')
    return { family: 'STATION', command: kitchenStationResolutionSchema.parse(value.command) };
  if (value.family === 'ROUTING')
    return { family: 'ROUTING', command: kitchenRoutingIdentitySchema.parse(value.command) };
  throw new Error(text.invalid);
}
export function sameStationIdentity(a: StationOperationIdentity, b: StationOperationIdentity) {
  return (
    JSON.stringify(canonicalStationIdentity(a)) === JSON.stringify(canonicalStationIdentity(b))
  );
}
export function stationPointerKey(scope: StationScope, family: StationOperationIdentity['family']) {
  return `pos.station-operation:${family}:${scope.organizationId}:${scope.actorUserId}:${scope.locationId}`;
}
export function readStationPointer(
  storage: StationStorage,
  scope: StationScope,
  family: StationOperationIdentity['family'],
): StationPointer | null {
  const raw = storage.getItem(stationPointerKey(scope, family));
  if (raw === null) return null;
  try {
    const value = JSON.parse(raw);
    if (
      Object.keys(value).sort().join(',') !==
        'actorUserId,command,family,locationId,organizationId' ||
      value.family !== family ||
      value.organizationId !== scope.organizationId ||
      value.actorUserId !== scope.actorUserId ||
      value.locationId !== scope.locationId
    )
      throw new Error(text.invalid);
    const identity = canonicalStationIdentity(value);
    if (identity.command.locationId !== scope.locationId) throw new Error(text.invalid);
    return {
      organizationId: scope.organizationId,
      actorUserId: scope.actorUserId,
      locationId: scope.locationId,
      ...identity,
    };
  } catch {
    throw new Error(text.invalid);
  }
}
export function storeStationPointer(storage: StationStorage, pointer: StationPointer) {
  const identity = canonicalStationIdentity(pointer);
  if (identity.command.locationId !== pointer.locationId) throw new Error(text.invalid);
  const existing = readStationPointer(storage, pointer, pointer.family);
  if (existing && !sameStationIdentity(existing, identity)) throw new Error(text.conflict);
  const { organizationId, actorUserId, locationId } = pointer;
  storage.setItem(
    stationPointerKey(pointer, pointer.family),
    JSON.stringify({ organizationId, actorUserId, locationId, ...identity }),
  );
  const saved = readStationPointer(storage, pointer, pointer.family);
  if (!saved || !sameStationIdentity(saved, identity)) throw new Error(text.storage);
}
export function clearStationPointer(storage: StationStorage, pointer: StationPointer) {
  const existing = readStationPointer(storage, pointer, pointer.family);
  if (existing && !sameStationIdentity(existing, pointer)) throw new Error(text.conflict);
  storage.removeItem(stationPointerKey(pointer, pointer.family));
  if (storage.getItem(stationPointerKey(pointer, pointer.family)) !== null)
    throw new Error(text.storage);
}
