import {
  kitchenAlertCommandIdentitySchema,
  kitchenAlertIdentitySchema,
  kitchenAlertThresholdsSchema,
} from '@pos/contracts/kitchen-alerts';
import type { KitchenAlertCommandIdentity, KitchenAlertRule } from '@pos/contracts/kitchen-alerts';
import { cashRecoveryMessages as text } from '@pos/ui/locales';
import type { AlertPointer, AlertPointerScope, AlertStorage } from '../model/alert.types';

export function sameAlertCommand(a: KitchenAlertCommandIdentity, b: KitchenAlertCommandIdentity) {
  return (
    JSON.stringify(kitchenAlertCommandIdentitySchema.parse(a)) ===
    JSON.stringify(kitchenAlertCommandIdentitySchema.parse(b))
  );
}
export function alertPointerKey(scope: AlertPointerScope) {
  return `pos.kitchen-alert:${scope.organizationId}:${scope.actorUserId}:${scope.locationId}`;
}
export function readAlertPointer(
  storage: AlertStorage,
  scope: AlertPointerScope,
): AlertPointer | null {
  const raw = storage.getItem(alertPointerKey(scope));
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
    const command = kitchenAlertCommandIdentitySchema.parse(value.command);
    if (command.scope.scopeType === 'LOCATION' && command.scope.locationId !== scope.locationId)
      throw new Error(text.invalid);
    return { ...scope, command };
  } catch {
    throw new Error(text.invalid);
  }
}
export function storeAlertPointer(storage: AlertStorage, pointer: AlertPointer) {
  const previous = readAlertPointer(storage, pointer);
  if (previous && !sameAlertCommand(previous.command, pointer.command))
    throw new Error(text.conflict);
  storage.setItem(alertPointerKey(pointer), JSON.stringify(pointer));
  const stored = readAlertPointer(storage, pointer);
  if (!stored || !sameAlertCommand(stored.command, pointer.command)) throw new Error(text.storage);
}
export function clearAlertPointer(storage: AlertStorage, pointer: AlertPointer) {
  const previous = readAlertPointer(storage, pointer);
  if (previous && !sameAlertCommand(previous.command, pointer.command))
    throw new Error(text.conflict);
  storage.removeItem(alertPointerKey(pointer));
  if (storage.getItem(alertPointerKey(pointer)) !== null) throw new Error(text.storage);
}
export function validateAlertResult(
  command: KitchenAlertCommandIdentity,
  rule: KitchenAlertRule,
  expectedVersion?: number,
) {
  // Rule versions use the DB integer range, independently of the timer limit.
  const identity = kitchenAlertIdentitySchema.parse({ scope: rule.scope, target: rule.target });
  if (
    JSON.stringify(identity) !==
      JSON.stringify(
        kitchenAlertIdentitySchema.parse({ scope: command.scope, target: command.target }),
      ) ||
    !Number.isInteger(rule.version) ||
    rule.version < 1 ||
    rule.version > 2147483647 ||
    (expectedVersion !== undefined && rule.version !== expectedVersion + 1)
  )
    throw new Error(text.invalid);
  if (rule.thresholds !== null) kitchenAlertThresholdsSchema.parse(rule.thresholds);
}
