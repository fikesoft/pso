import { cashRegisterResolutionSchema } from '@pos/contracts/cash-registers';
import { cashRegisterMessages as text } from '@pos/ui/locales';
import type {
  RegisterPointer,
  RegisterScope,
  RegisterStorage,
} from '../model/register-management.types';
export function registerStorageKey(scope: RegisterScope) {
  return `pos.cash-register:${scope.organizationId}:${scope.actorUserId}:${scope.locationId}`;
}
export function readRegisterPointer(
  storage: RegisterStorage,
  scope: RegisterScope,
): RegisterPointer | null {
  const raw = storage.getItem(registerStorageKey(scope));
  if (raw === null) return null;
  try {
    const value = JSON.parse(raw);
    const { organizationId, actorUserId, ...resolution } = value;
    if (
      organizationId !== scope.organizationId ||
      actorUserId !== scope.actorUserId ||
      resolution.locationId !== scope.locationId
    )
      throw new Error(text.invalidPointer);
    return { organizationId, actorUserId, ...cashRegisterResolutionSchema.parse(resolution) };
  } catch {
    throw new Error(text.invalidPointer);
  }
}
export function registerResolution(pointer: RegisterPointer) {
  return cashRegisterResolutionSchema.parse({
    locationId: pointer.locationId,
    requestKey: pointer.requestKey,
    kind: pointer.kind,
    ...(pointer.kind === 'CREATE' ? {} : { registerId: pointer.registerId }),
  });
}
function samePointer(left: RegisterPointer, right: RegisterPointer) {
  return JSON.stringify(registerResolution(left)) === JSON.stringify(registerResolution(right));
}
export function storeRegisterPointer(storage: RegisterStorage, pointer: RegisterPointer) {
  const current = readRegisterPointer(storage, pointer);
  if (current && !samePointer(current, pointer)) throw new Error(text.storageConflict);
  const value = {
    organizationId: pointer.organizationId,
    actorUserId: pointer.actorUserId,
    ...registerResolution(pointer),
  };
  storage.setItem(registerStorageKey(pointer), JSON.stringify(value));
  const saved = readRegisterPointer(storage, pointer);
  if (!saved || !samePointer(saved, pointer)) throw new Error(text.storageError);
}
export function clearRegisterPointer(storage: RegisterStorage, pointer: RegisterPointer) {
  const current = readRegisterPointer(storage, pointer);
  if (!current) return;
  if (!samePointer(current, pointer)) throw new Error(text.storageConflict);
  storage.removeItem(registerStorageKey(pointer));
  if (storage.getItem(registerStorageKey(pointer)) !== null) throw new Error(text.storageError);
}
