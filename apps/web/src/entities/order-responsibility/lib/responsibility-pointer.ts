import { orderResponsibilityResolutionSchema } from '@pos/contracts/order-responsibilities';
import type { OrderResponsibilityCommandIdentity } from '@pos/contracts/order-responsibilities';
import { cashRecoveryMessages as text } from '@pos/ui/locales';
import type {
  ResponsibilityPointer,
  ResponsibilityScope,
  ResponsibilityStorage,
} from '../model/responsibility.types';
export function responsibilityIdentity(
  value: OrderResponsibilityCommandIdentity,
): OrderResponsibilityCommandIdentity {
  const { orderId, ...body } = value;
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(orderId))
    throw new Error(text.invalid);
  return { ...orderResponsibilityResolutionSchema.parse(body), orderId };
}
export function sameResponsibilityCommand(
  a: OrderResponsibilityCommandIdentity,
  b: OrderResponsibilityCommandIdentity,
) {
  return JSON.stringify(responsibilityIdentity(a)) === JSON.stringify(responsibilityIdentity(b));
}
export function responsibilityPointerKey(scope: ResponsibilityScope) {
  return `pos.order-responsibility:${scope.organizationId}:${scope.actorUserId}:${scope.locationId}`;
}
export function readResponsibilityPointer(
  storage: ResponsibilityStorage,
  scope: ResponsibilityScope,
): ResponsibilityPointer | null {
  const raw = storage.getItem(responsibilityPointerKey(scope));
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
    const command = responsibilityIdentity(value.command);
    if (command.locationId !== scope.locationId) throw new Error(text.invalid);
    return {
      organizationId: scope.organizationId,
      actorUserId: scope.actorUserId,
      locationId: scope.locationId,
      command,
    };
  } catch {
    throw new Error(text.invalid);
  }
}
export function storeResponsibilityPointer(
  storage: ResponsibilityStorage,
  pointer: ResponsibilityPointer,
) {
  const command = responsibilityIdentity(pointer.command);
  if (command.locationId !== pointer.locationId) throw new Error(text.invalid);
  const existing = readResponsibilityPointer(storage, pointer);
  if (existing && !sameResponsibilityCommand(existing.command, command))
    throw new Error(text.conflict);
  const { organizationId, actorUserId, locationId } = pointer;
  storage.setItem(
    responsibilityPointerKey(pointer),
    JSON.stringify({ organizationId, actorUserId, locationId, command }),
  );
  const saved = readResponsibilityPointer(storage, pointer);
  if (!saved || !sameResponsibilityCommand(saved.command, command)) throw new Error(text.storage);
}
export function clearResponsibilityPointer(
  storage: ResponsibilityStorage,
  pointer: ResponsibilityPointer,
) {
  const existing = readResponsibilityPointer(storage, pointer);
  if (existing && !sameResponsibilityCommand(existing.command, pointer.command))
    throw new Error(text.conflict);
  storage.removeItem(responsibilityPointerKey(pointer));
  if (storage.getItem(responsibilityPointerKey(pointer)) !== null) throw new Error(text.storage);
}
