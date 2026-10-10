import {
  billPlanResolutionSchema,
  billPartCommandIdentitySchema,
} from '@pos/contracts/bill-splits';
import { cashRecoveryMessages as text } from '@pos/ui/locales';
import type {
  BillPointer,
  BillOperationIdentity,
  BillScope,
  BillStorage,
} from '../model/bill-operation.types';
export function canonicalBillIdentity(value: BillOperationIdentity): BillOperationIdentity {
  if (value.family === 'PLAN')
    return { family: 'PLAN', command: billPlanResolutionSchema.parse(value.command) };
  if (value.family === 'COLLECTION')
    return { family: 'COLLECTION', command: billPartCommandIdentitySchema.parse(value.command) };
  throw new Error(text.invalid);
}
export function sameBillIdentity(a: BillOperationIdentity, b: BillOperationIdentity) {
  return JSON.stringify(canonicalBillIdentity(a)) === JSON.stringify(canonicalBillIdentity(b));
}
export function billPointerKey(scope: BillScope, family: 'PLAN' | 'COLLECTION') {
  return `pos.bill-operation:${family}:${scope.organizationId}:${scope.actorUserId}:${scope.locationId}`;
}
export function readBillPointer(
  storage: BillStorage,
  scope: BillScope,
  family: 'PLAN' | 'COLLECTION',
): BillPointer | null {
  const raw = storage.getItem(billPointerKey(scope, family));
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
    const identity = canonicalBillIdentity(value);
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
export function storeBillPointer(storage: BillStorage, pointer: BillPointer) {
  const identity = canonicalBillIdentity(pointer);
  if (identity.command.locationId !== pointer.locationId) throw new Error(text.invalid);
  const existing = readBillPointer(storage, pointer, pointer.family);
  if (existing && !sameBillIdentity(existing, identity)) throw new Error(text.conflict);
  const { organizationId, actorUserId, locationId } = pointer;
  storage.setItem(
    billPointerKey(pointer, pointer.family),
    JSON.stringify({ organizationId, actorUserId, locationId, ...identity }),
  );
  const saved = readBillPointer(storage, pointer, pointer.family);
  if (!saved || !sameBillIdentity(saved, identity)) throw new Error(text.storage);
}
export function clearBillPointer(storage: BillStorage, pointer: BillPointer) {
  const existing = readBillPointer(storage, pointer, pointer.family);
  if (existing && !sameBillIdentity(existing, pointer)) throw new Error(text.conflict);
  storage.removeItem(billPointerKey(pointer, pointer.family));
  if (storage.getItem(billPointerKey(pointer, pointer.family)) !== null)
    throw new Error(text.storage);
}
