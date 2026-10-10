import type { KitchenStationDto, KitchenStationStatus } from '@pos/contracts';
import type { StoredKitchenStation, StoredStationCommand } from './station.types';
export function stationResponse(row: StoredKitchenStation): KitchenStationDto {
  return {
    id: row.id,
    locationId: row.locationId,
    code: row.code,
    name: row.name,
    sortOrder: row.sortOrder,
    status: row.status as KitchenStationStatus,
    version: row.version,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}
export function stationCommandResponse(row: StoredStationCommand): KitchenStationDto {
  if (
    row.status !== 'SUCCEEDED' ||
    !row.stationId ||
    !row.resultCode ||
    !row.resultName ||
    !row.resultStatus ||
    !row.resultVersion ||
    !row.resultCreatedAt ||
    !row.resultUpdatedAt ||
    row.resultSortOrder === null
  )
    throw new Error('Rezultatul comenzii stației nu este complet.');
  return {
    id: row.stationId,
    locationId: row.locationId,
    code: row.resultCode,
    name: row.resultName,
    sortOrder: row.resultSortOrder,
    status: row.resultStatus as KitchenStationStatus,
    version: row.resultVersion,
    createdAt: row.resultCreatedAt.toISOString(),
    updatedAt: row.resultUpdatedAt.toISOString(),
  };
}
