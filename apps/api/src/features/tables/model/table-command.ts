import type { TenantTransaction } from '@pos/db';
import { tableCommandResponse } from '../../../entities/dining-table';
import type { StoredDiningTable } from '../../../entities/dining-table';
import { HttpError, assert } from '../../../shared/lib/http';
import type { TableCommandIdentity } from './table-command.types';
export async function readTableCommand(
  tx: TenantTransaction,
  identity: TableCommandIdentity,
  actor: string,
) {
  const claim = await tx.diningTableCommand.findFirst({
    where: { locationId: identity.locationId, requestKey: identity.requestKey },
  });
  if (
    claim &&
    (claim.actorUserId !== actor ||
      claim.kind !== identity.kind ||
      (identity.kind !== 'CREATE' && claim.tableId !== identity.tableId))
  )
    throw new HttpError(
      409,
      'Cheia cererii aparține altei operațiuni.',
      'DINING_TABLE_REQUEST_CONFLICT',
    );
  return claim;
}
export async function replayTableCommand(
  tx: TenantTransaction,
  identity: TableCommandIdentity,
  actor: string,
  hash: string,
) {
  const claim = await readTableCommand(tx, identity, actor);
  if (!claim) return null;
  if (claim.status === 'RETIRED')
    throw new HttpError(
      409,
      'Tentativa a fost retrasă. Inițiați o cerere nouă.',
      'DINING_TABLE_REQUEST_RETIRED',
    );
  if (claim.requestHash !== hash)
    throw new HttpError(
      409,
      'Cheia cererii a fost folosită pentru alte date.',
      'DINING_TABLE_REQUEST_CONFLICT',
    );
  return tableCommandResponse(claim);
}
export async function lockTable(tx: TenantTransaction, locationId: string, id: string) {
  const rows = await tx.$queryRaw<Array<{ id: string }>>`
    SELECT id FROM "DiningTable" WHERE id=${id}::uuid AND "locationId"=${locationId}::uuid FOR NO KEY UPDATE`;
  assert(rows.length === 1, 404, 'Masa nu există');
  return tx.diningTable.findUniqueOrThrow({ where: { id } });
}
export async function saveTableCommand(
  tx: TenantTransaction,
  row: StoredDiningTable,
  identity: TableCommandIdentity,
  expectedVersion: number | null,
) {
  await tx.diningTableCommand.create({
    data: {
      organizationId: row.organizationId,
      locationId: row.locationId,
      requestKey: identity.requestKey,
      kind: identity.kind,
      actorUserId: row.updatedByUserId,
      status: 'SUCCEEDED',
      tableId: row.id,
      requestHash: row.lastRequestHash,
      expectedVersion,
      resultCode: row.code,
      resultName: row.name,
      resultCapacity: row.capacity,
      resultSortOrder: row.sortOrder,
      resultStatus: row.status,
      resultVersion: row.version,
      resultCreatedAt: row.createdAt,
      resultUpdatedAt: row.updatedAt,
    },
  });
}
