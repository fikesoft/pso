import { cashRecoveryMessages as text } from '@pos/ui/locales';
import type { TableOperationIdentity, TableOperationResult } from '../model/table-operation.types';

export function validateTableResult(identity: TableOperationIdentity, value: TableOperationResult) {
  if (identity.family === 'TABLE' && value.family === 'TABLE') {
    const table = value.result.table;
    if (
      table.locationId === identity.command.locationId &&
      (identity.command.kind === 'CREATE' || table.id === identity.command.tableId)
    )
      return;
  }
  if (identity.family === 'VISIT' && value.family === 'VISIT') {
    const event = value.result.event;
    if (
      event.locationId === identity.command.locationId &&
      event.kind === identity.command.kind &&
      (identity.command.kind === 'OPEN'
        ? event.tableId === identity.command.tableId
        : event.visitId === identity.command.visitId) &&
      (identity.command.kind !== 'MERGED' ||
        event.result.mergedIntoVisitId === identity.command.targetVisitId) &&
      (identity.command.kind !== 'MOVED' ||
        event.result.tableId === identity.command.targetTableId) &&
      (identity.command.kind !== 'WAITER_CHANGED' ||
        event.result.waiter.id === identity.command.targetWaiterUserId)
    )
      return;
  }
  throw new Error(text.invalid);
}
