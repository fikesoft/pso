import {
  customerManagementResolutionSchema,
  customerManagementCommandResponseSchema,
  customerManagementDtoSchema,
} from '@pos/contracts/customer-management';
import type { CustomerManagementCommandResponse } from '@pos/contracts';
import { cashRecoveryMessages as text } from '@pos/ui/locales';
import type {
  CustomerAttempt,
  CustomerPointer,
  CustomerPointerScope,
  CustomerPointerStorage,
} from '../model/customer-management.types';

export function customerPointerKey(scope: CustomerPointerScope) {
  return `pos.customer-management:${scope.organizationId}:${scope.actorUserId}:${scope.locationId}`;
}
export function sameCustomerPointer(a: CustomerPointer, b: CustomerPointer) {
  return (
    a.organizationId === b.organizationId &&
    a.actorUserId === b.actorUserId &&
    a.locationId === b.locationId &&
    a.customerId === b.customerId &&
    a.command.locationId === b.command.locationId &&
    a.command.action === b.command.action &&
    a.command.requestKey === b.command.requestKey
  );
}
export function readCustomerPointer(
  storage: CustomerPointerStorage,
  scope: CustomerPointerScope,
): CustomerPointer | null {
  const raw = storage.getItem(customerPointerKey(scope));
  if (raw === null) return null;
  try {
    const value = JSON.parse(raw);
    if (
      Object.keys(value).sort().join(',') !==
        'actorUserId,command,customerId,locationId,organizationId' ||
      value.organizationId !== scope.organizationId ||
      value.actorUserId !== scope.actorUserId ||
      value.locationId !== scope.locationId ||
      value.command.locationId !== scope.locationId
    )
      throw new Error(text.invalid);
    return {
      ...scope,
      customerId: customerManagementDtoSchema.shape.id.parse(value.customerId),
      command: customerManagementResolutionSchema.parse(value.command),
    };
  } catch {
    throw new Error(text.invalid);
  }
}
export function storeCustomerPointer(storage: CustomerPointerStorage, pointer: CustomerPointer) {
  const previous = readCustomerPointer(storage, pointer);
  if (previous && !sameCustomerPointer(previous, pointer)) throw new Error(text.conflict);
  // Construct explicitly: caller-owned payloads must never reach browser storage.
  const saved = {
    organizationId: pointer.organizationId,
    actorUserId: pointer.actorUserId,
    locationId: pointer.locationId,
    customerId: customerManagementDtoSchema.shape.id.parse(pointer.customerId),
    command: customerManagementResolutionSchema.parse(pointer.command),
  };
  if (saved.command.locationId !== saved.locationId) throw new Error(text.invalid);
  storage.setItem(customerPointerKey(pointer), JSON.stringify(saved));
  const stored = readCustomerPointer(storage, pointer);
  if (!stored || !sameCustomerPointer(stored, pointer)) throw new Error(text.storage);
}
export function clearCustomerPointer(storage: CustomerPointerStorage, pointer: CustomerPointer) {
  const previous = readCustomerPointer(storage, pointer);
  if (previous && !sameCustomerPointer(previous, pointer)) throw new Error(text.conflict);
  storage.removeItem(customerPointerKey(pointer));
  if (storage.getItem(customerPointerKey(pointer)) !== null) throw new Error(text.storage);
}
export function validateCustomerOutcome(
  pointer: CustomerPointer,
  value: CustomerManagementCommandResponse,
  attempt?: CustomerAttempt,
) {
  const response = customerManagementCommandResponseSchema.parse(value);
  if (response.customer.id !== pointer.customerId) throw new Error(text.invalid);
  if (response.status === 'RETIRED') return response;
  const result = response.result;
  if (
    result.customerId !== pointer.customerId ||
    result.requestKey !== pointer.command.requestKey ||
    result.action !== pointer.command.action ||
    response.customer.version < result.version ||
    (response.customer.version === result.version && response.customer.status !== result.status) ||
    (attempt && result.expectedVersion !== attempt.version)
  )
    throw new Error(text.invalid);
  return response;
}
