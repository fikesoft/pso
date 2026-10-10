import type { TenantTransaction } from '@pos/db';
import { stationCommandResponse } from '../../../entities/kitchen-station';
import type { StoredKitchenStation } from '../../../entities/kitchen-station';
import { HttpError, assert } from '../../../shared/lib/http';
import type { StationCommandIdentity } from './station-command.types';
export async function readStationCommand(
  tx: TenantTransaction,
  identity: StationCommandIdentity,
  actor: string,
) {
  const claim = await tx.kitchenStationCommand.findFirst({
    where: { locationId: identity.locationId, requestKey: identity.requestKey },
  });
  if (
    claim &&
    (claim.actorUserId !== actor ||
      claim.kind !== identity.kind ||
      (identity.kind !== 'CREATE' && claim.stationId !== identity.stationId))
  )
    throw new HttpError(
      409,
      'Cheia cererii aparține altei operațiuni.',
      'KITCHEN_STATION_REQUEST_CONFLICT',
    );
  return claim;
}
export async function replayStationCommand(
  tx: TenantTransaction,
  identity: StationCommandIdentity,
  actor: string,
  hash: string,
) {
  const claim = await readStationCommand(tx, identity, actor);
  if (!claim) return null;
  if (claim.status === 'RETIRED')
    throw new HttpError(
      409,
      'Tentativa a fost retrasă. Inițiați o cerere nouă.',
      'KITCHEN_STATION_REQUEST_RETIRED',
    );
  if (claim.requestHash !== hash)
    throw new HttpError(
      409,
      'Cheia cererii a fost folosită pentru alte date.',
      'KITCHEN_STATION_REQUEST_CONFLICT',
    );
  return stationCommandResponse(claim);
}
export async function lockStation(tx: TenantTransaction, locationId: string, id: string) {
  const rows = await tx.$queryRaw<Array<{ id: string }>>`
    SELECT id FROM "KitchenStation" WHERE id=${id}::uuid AND "locationId"=${locationId}::uuid FOR NO KEY UPDATE`;
  assert(rows.length === 1, 404, 'Stația nu există');
  return tx.kitchenStation.findUniqueOrThrow({ where: { id } });
}
export async function saveStationCommand(
  tx: TenantTransaction,
  row: StoredKitchenStation,
  identity: StationCommandIdentity,
  expectedVersion: number | null,
) {
  await tx.kitchenStationCommand.create({
    data: {
      organizationId: row.organizationId,
      locationId: row.locationId,
      requestKey: identity.requestKey,
      kind: identity.kind,
      actorUserId: row.updatedByUserId,
      status: 'SUCCEEDED',
      stationId: row.id,
      requestHash: row.lastRequestHash,
      expectedVersion,
      resultCode: row.code,
      resultName: row.name,
      resultSortOrder: row.sortOrder,
      resultStatus: row.status,
      resultVersion: row.version,
      resultCreatedAt: row.createdAt,
      resultUpdatedAt: row.updatedAt,
    },
  });
}
