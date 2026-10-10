import {
  cashShiftResolutionSchema,
  paymentCommandResolutionSchema,
  manualCheckoutResolutionSchema,
} from '@pos/contracts/cash-shifts';
import { cashMovementResolutionSchema } from '@pos/contracts/cash-movements';
import type { CashCommandIdentity } from '@pos/contracts';
import { cashRecoveryMessages as text } from '@pos/ui/locales';
import type {
  CashCommandPointer,
  CashCommandScope,
  CashPointerStorage,
  CashRecoveryChannel,
} from '../model/cash-command.types';
export function cashCommandIdentity(value: CashCommandIdentity): CashCommandIdentity {
  if (value.kind === 'OPEN' || value.kind === 'CLOSE')
    return cashShiftResolutionSchema.parse(value);
  if ('shiftId' in value) return cashMovementResolutionSchema.parse(value);
  const { orderId, kind, ...body } = value;
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(orderId))
    throw new Error(text.invalid);
  if (kind === 'CHECKOUT_MANUAL')
    return { ...manualCheckoutResolutionSchema.parse(body), kind, orderId };
  return { ...paymentCommandResolutionSchema.parse({ ...body, kind }), orderId };
}
export function sameCashCommand(a: CashCommandIdentity, b: CashCommandIdentity) {
  const left = cashCommandIdentity(a),
    right = cashCommandIdentity(b);
  return (
    left.locationId === right.locationId &&
    left.requestKey === right.requestKey &&
    left.kind === right.kind &&
    ('registerId' in left
      ? 'registerId' in right && left.registerId === right.registerId
      : 'shiftId' in left
        ? 'shiftId' in right && left.shiftId === right.shiftId
        : 'orderId' in right && left.orderId === right.orderId)
  );
}
export function cashPointerKey(scope: CashCommandScope, channel: CashRecoveryChannel) {
  return `pos.cash-command:${channel}:${scope.organizationId}:${scope.actorUserId}:${scope.locationId}`;
}
export function readCashPointer(
  storage: CashPointerStorage,
  scope: CashCommandScope,
  channel: CashRecoveryChannel,
): CashCommandPointer | null {
  const raw = storage.getItem(cashPointerKey(scope, channel));
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
    const command = cashCommandIdentity(value.command);
    if (
      command.locationId !== scope.locationId ||
      (channel === 'CASH') !== isCashDrawerCommand(command)
    )
      throw new Error(text.invalid);
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
export function storeCashPointer(
  storage: CashPointerStorage,
  pointer: CashCommandPointer,
  channel: CashRecoveryChannel,
) {
  if (
    pointer.command.locationId !== pointer.locationId ||
    (channel === 'CASH') !== isCashDrawerCommand(pointer.command)
  )
    throw new Error(text.invalid);
  cashCommandIdentity(pointer.command);
  const current = readCashPointer(storage, pointer, channel);
  if (current && !sameCashCommand(current.command, pointer.command)) throw new Error(text.conflict);
  const { organizationId, actorUserId, locationId } = pointer;
  storage.setItem(
    cashPointerKey(pointer, channel),
    JSON.stringify({
      organizationId,
      actorUserId,
      locationId,
      command: cashCommandIdentity(pointer.command),
    }),
  );
  const saved = readCashPointer(storage, pointer, channel);
  if (!saved || !sameCashCommand(saved.command, pointer.command)) throw new Error(text.storage);
}
export function clearCashPointer(
  storage: CashPointerStorage,
  pointer: CashCommandPointer,
  channel: CashRecoveryChannel,
) {
  const current = readCashPointer(storage, pointer, channel);
  if (current && !sameCashCommand(current.command, pointer.command)) throw new Error(text.conflict);
  storage.removeItem(cashPointerKey(pointer, channel));
  if (storage.getItem(cashPointerKey(pointer, channel)) !== null) throw new Error(text.storage);
}

export function isCashDrawerCommand(command: CashCommandIdentity) {
  return (
    command.kind === 'OPEN' ||
    command.kind === 'CLOSE' ||
    command.kind === 'CASH_IN' ||
    command.kind === 'CASH_OUT'
  );
}
