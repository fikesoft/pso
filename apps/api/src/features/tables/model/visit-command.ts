import type { TableVisitCommandIdentity, TableVisitResolutionResponse } from '@pos/contracts';
import type { TenantTransaction } from '@pos/db';
import type { AccessData } from '../../../entities/tenant-access';
import { visitEventResponse } from '../../../entities/table-visit';
import { HttpError } from '../../../shared/lib/http';
import { requireVisitAccess, readVisit } from './visit-access';
import { lockTable } from './table-command';
export async function readVisitCommand(
  tx: TenantTransaction,
  actor: string,
  identity: TableVisitCommandIdentity,
  hash?: string,
) {
  const row = await tx.tableVisitCommand.findFirst({
    where: { locationId: identity.locationId, requestKey: identity.requestKey },
  });
  if (
    row &&
    (row.actorUserId !== actor ||
      row.kind !== identity.kind ||
      (identity.kind === 'OPEN'
        ? row.tableId !== identity.tableId
        : row.visitId !== identity.visitId) ||
      (identity.kind === 'MERGED' && row.targetVisitId !== identity.targetVisitId) ||
      (identity.kind === 'MOVED' && row.targetTableId !== identity.targetTableId) ||
      (identity.kind === 'WAITER_CHANGED' &&
        row.targetWaiterUserId !== identity.targetWaiterUserId) ||
      (hash !== undefined && row.status === 'SUCCEEDED' && row.requestHash !== hash))
  )
    throw new HttpError(409, 'Cheia cererii aparține altei operațiuni.', 'TABLE_COMMAND_CONFLICT');
  return row;
}
export async function replayVisit(
  tx: TenantTransaction,
  actor: string,
  identity: TableVisitCommandIdentity,
  hash: string,
) {
  const row = await readVisitCommand(tx, actor, identity, hash);
  if (!row) return null;
  if (row.status === 'RETIRED')
    throw new HttpError(
      409,
      'Tentativa a fost retrasă. Inițiați o cerere nouă.',
      'TABLE_COMMAND_RETIRED',
    );
  return {
    event: visitEventResponse(
      await tx.tableVisitEvent.findUniqueOrThrow({ where: { id: row.resultEventId! } }),
    ),
  };
}
export async function saveVisitCommand(
  tx: TenantTransaction,
  org: string,
  actor: string,
  identity: TableVisitCommandIdentity,
  result?: { eventId: string; hash: string },
) {
  await tx.tableVisitCommand.create({
    data: {
      organizationId: org,
      locationId: identity.locationId,
      actorUserId: actor,
      requestKey: identity.requestKey,
      kind: identity.kind,
      tableId: identity.kind === 'OPEN' ? identity.tableId : null,
      visitId: identity.kind === 'OPEN' ? null : identity.visitId,
      targetVisitId: identity.kind === 'MERGED' ? identity.targetVisitId : null,
      targetTableId: identity.kind === 'MOVED' ? identity.targetTableId : null,
      targetWaiterUserId: identity.kind === 'WAITER_CHANGED' ? identity.targetWaiterUserId : null,
      status: result ? 'SUCCEEDED' : 'RETIRED',
      requestHash: result?.hash ?? null,
      resultEventId: result?.eventId ?? null,
    },
  });
}
export async function resolveVisit(
  tx: TenantTransaction,
  access: AccessData,
  actor: string,
  identity: TableVisitCommandIdentity,
): Promise<TableVisitResolutionResponse> {
  requireVisitAccess(access, actor, identity.locationId, identity.kind === 'WAITER_CHANGED');
  let row = await readVisitCommand(tx, actor, identity);
  if (!row) {
    if (identity.kind === 'MERGED')
      await readVisit(tx, identity.locationId, identity.targetVisitId);
    if (identity.kind === 'MOVED') await lockTable(tx, identity.locationId, identity.targetTableId);
    if (identity.kind === 'OPEN') await lockTable(tx, identity.locationId, identity.tableId);
    else await readVisit(tx, identity.locationId, identity.visitId, true);
    row = await readVisitCommand(tx, actor, identity);
    if (!row) await saveVisitCommand(tx, access.org.id, actor, identity);
  }
  if (row?.status === 'SUCCEEDED')
    return {
      status: 'SUCCEEDED',
      command: identity,
      result: {
        event: visitEventResponse(
          await tx.tableVisitEvent.findUniqueOrThrow({ where: { id: row.resultEventId! } }),
        ),
      },
    };
  return { status: 'RETIRED', command: identity };
}
