import { cashRecoveryMessages as text } from '@pos/ui/locales';
import type { BillOperationIdentity, BillOperationResult } from '../model/bill-operation.types';
export function validateBillResult(
  identity: BillOperationIdentity,
  value: BillOperationResult,
  actor: string,
) {
  if (identity.family === 'PLAN' && value.family === 'PLAN') {
    const split = value.result.split,
      command = identity.command;
    if (
      split.locationId === command.locationId &&
      (command.kind === 'CREATE'
        ? split.actorUserId === actor &&
          split.requestKey === command.requestKey &&
          split.context.kind === command.context.kind &&
          split.context.id === command.context.id
        : split.id === command.splitId &&
          split.status === 'VOIDED' &&
          split.voided?.actorUserId === actor &&
          split.voided.requestKey === command.requestKey)
    )
      return;
  }
  if (identity.family === 'COLLECTION' && value.family === 'COLLECTION') {
    const collection = value.result.collection,
      command = identity.command;
    if (
      collection.partId === command.partId &&
      collection.locationId === command.locationId &&
      collection.requestKey === command.requestKey &&
      collection.actorUserId === actor
    )
      return;
  }
  throw new Error(text.invalid);
}
