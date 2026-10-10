import { resolvePackingCommandSchema, packingCommandResultSchema } from '@pos/contracts/packing';
import type { PackingCommandResult, ResolvePackingCommandInput } from '@pos/contracts';
import { cashRecoveryMessages as text } from '@pos/ui/locales';
import type {
  PackingAttempt,
  PackingPointer,
  PackingPointerScope,
  PackingStorage,
} from '../model/packing.types';

export function samePackingCommand(a: ResolvePackingCommandInput, b: ResolvePackingCommandInput) {
  return (
    JSON.stringify(resolvePackingCommandSchema.parse(a)) ===
    JSON.stringify(resolvePackingCommandSchema.parse(b))
  );
}
export function packingPointerKey(scope: PackingPointerScope) {
  return `pos.packing:${scope.organizationId}:${scope.actorUserId}:${scope.locationId}`;
}
export function readPackingPointer(
  storage: PackingStorage,
  scope: PackingPointerScope,
): PackingPointer | null {
  const raw = storage.getItem(packingPointerKey(scope));
  if (raw === null) return null;
  try {
    const value = JSON.parse(raw);
    if (
      Object.keys(value).sort().join(',') !== 'actorUserId,command,locationId,organizationId' ||
      value.organizationId !== scope.organizationId ||
      value.actorUserId !== scope.actorUserId ||
      value.locationId !== scope.locationId
    )
      throw new Error(text.invalid);
    return { ...scope, command: resolvePackingCommandSchema.parse(value.command) };
  } catch {
    throw new Error(text.invalid);
  }
}
export function storePackingPointer(storage: PackingStorage, pointer: PackingPointer) {
  const previous = readPackingPointer(storage, pointer);
  if (previous && !samePackingCommand(previous.command, pointer.command))
    throw new Error(text.conflict);
  storage.setItem(packingPointerKey(pointer), JSON.stringify(pointer));
  const stored = readPackingPointer(storage, pointer);
  if (!stored || !samePackingCommand(stored.command, pointer.command))
    throw new Error(text.storage);
}
export function clearPackingPointer(storage: PackingStorage, pointer: PackingPointer) {
  const previous = readPackingPointer(storage, pointer);
  if (previous && !samePackingCommand(previous.command, pointer.command))
    throw new Error(text.conflict);
  storage.removeItem(packingPointerKey(pointer));
  if (storage.getItem(packingPointerKey(pointer)) !== null) throw new Error(text.storage);
}
export function validatePackingResult(
  command: ResolvePackingCommandInput,
  value: PackingCommandResult,
  attempt?: PackingAttempt,
) {
  const result = packingCommandResultSchema.parse(value);
  if (
    !samePackingCommand(command, {
      sessionId: result.sessionId,
      requestKey: result.requestKey,
      action: result.action,
    }) ||
    (attempt && result.expectedVersion !== attempt.version)
  )
    throw new Error(text.invalid);
  if (
    attempt?.action === 'CHECK_ITEM' &&
    (result.action !== 'CHECK_ITEM' ||
      result.itemId !== attempt.itemId ||
      result.checked !== attempt.checked)
  )
    throw new Error(text.invalid);
}
