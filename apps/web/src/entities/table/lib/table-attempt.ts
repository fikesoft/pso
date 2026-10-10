import type { Api } from '../../../shared/api';
import {
  createDiningTable,
  updateDiningTable,
  archiveDiningTable,
  resolveDiningTable,
} from '../api/table.api';
import { openTableVisit, executeTableVisit, resolveTableVisit } from '../api/visit.api';
import type {
  TableAttempt,
  TableOperationIdentity,
  TableOperationResult,
} from '../model/table-operation.types';
export function tableAttemptIdentity(value: TableAttempt): TableOperationIdentity {
  const base = { locationId: value.body.locationId, requestKey: value.body.requestKey };
  if (value.family === 'TABLE')
    return {
      family: 'TABLE',
      command:
        value.kind === 'CREATE'
          ? { ...base, kind: value.kind }
          : { ...base, kind: value.kind, tableId: value.tableId },
    };
  if (value.kind === 'OPEN')
    return { family: 'VISIT', command: { ...base, kind: 'OPEN', tableId: value.tableId } };
  const command = { ...base, visitId: value.visitId, kind: value.body.kind };
  if (value.body.kind === 'MERGED')
    return {
      family: 'VISIT',
      command: { ...command, kind: 'MERGED', targetVisitId: value.body.targetVisitId },
    };
  if (value.body.kind === 'MOVED')
    return {
      family: 'VISIT',
      command: { ...command, kind: 'MOVED', targetTableId: value.body.targetTableId },
    };
  return {
    family: 'VISIT',
    command:
      value.body.kind === 'WAITER_CHANGED'
        ? { ...command, kind: 'WAITER_CHANGED', targetWaiterUserId: value.body.targetWaiterUserId }
        : { ...command, kind: value.body.kind },
  };
}
export async function sendTableAttempt(
  api: Api,
  value: TableAttempt,
): Promise<TableOperationResult> {
  if (value.family === 'VISIT')
    return {
      family: 'VISIT',
      result:
        value.kind === 'OPEN'
          ? await openTableVisit(api, value.tableId, value.body)
          : await executeTableVisit(api, value.visitId, value.body),
    };
  return {
    family: 'TABLE',
    result:
      value.kind === 'CREATE'
        ? await createDiningTable(api, value.body)
        : value.kind === 'UPDATE'
          ? await updateDiningTable(api, value.tableId, value.body)
          : await archiveDiningTable(api, value.tableId, value.body),
  };
}
export async function resolveTableOperation(api: Api, identity: TableOperationIdentity) {
  return identity.family === 'TABLE'
    ? resolveDiningTable(api, identity.command)
    : resolveTableVisit(api, identity.command);
}
