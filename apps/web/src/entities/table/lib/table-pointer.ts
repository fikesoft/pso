import { diningTableResolutionSchema, tableVisitResolutionSchema } from '@pos/contracts/tables';
import { cashRecoveryMessages as text } from '@pos/ui/locales';
import type {
  TablePointer,
  TableOperationIdentity,
  TableScope,
  TableStorage,
} from '../model/table-operation.types';
export function canonicalTableIdentity(value: TableOperationIdentity): TableOperationIdentity {
  if (value.family === 'TABLE')
    return { family: 'TABLE', command: diningTableResolutionSchema.parse(value.command) };
  if (value.family === 'VISIT')
    return { family: 'VISIT', command: tableVisitResolutionSchema.parse(value.command) };
  throw new Error(text.invalid);
}
export function sameTableIdentity(a: TableOperationIdentity, b: TableOperationIdentity) {
  return JSON.stringify(canonicalTableIdentity(a)) === JSON.stringify(canonicalTableIdentity(b));
}
export function tablePointerKey(scope: TableScope, family: 'TABLE' | 'VISIT') {
  return `pos.table-operation:${family}:${scope.organizationId}:${scope.actorUserId}:${scope.locationId}`;
}
export function readTablePointer(
  storage: TableStorage,
  scope: TableScope,
  family: 'TABLE' | 'VISIT',
): TablePointer | null {
  const raw = storage.getItem(tablePointerKey(scope, family));
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
    const identity = canonicalTableIdentity(value);
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
export function storeTablePointer(storage: TableStorage, pointer: TablePointer) {
  const identity = canonicalTableIdentity(pointer);
  if (identity.command.locationId !== pointer.locationId) throw new Error(text.invalid);
  const existing = readTablePointer(storage, pointer, pointer.family);
  if (existing && !sameTableIdentity(existing, identity)) throw new Error(text.conflict);
  const { organizationId, actorUserId, locationId } = pointer;
  storage.setItem(
    tablePointerKey(pointer, pointer.family),
    JSON.stringify({ organizationId, actorUserId, locationId, ...identity }),
  );
  const saved = readTablePointer(storage, pointer, pointer.family);
  if (!saved || !sameTableIdentity(saved, identity)) throw new Error(text.storage);
}
export function clearTablePointer(storage: TableStorage, pointer: TablePointer) {
  const existing = readTablePointer(storage, pointer, pointer.family);
  if (existing && !sameTableIdentity(existing, pointer)) throw new Error(text.conflict);
  storage.removeItem(tablePointerKey(pointer, pointer.family));
  if (storage.getItem(tablePointerKey(pointer, pointer.family)) !== null)
    throw new Error(text.storage);
}
