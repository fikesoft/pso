import type { DiningTableDto, DiningTableStatus } from '@pos/contracts';
import type { StoredDiningTable, StoredTableCommand } from './table.types';
export function tableResponse(row: StoredDiningTable): DiningTableDto {
  return {
    id: row.id,
    locationId: row.locationId,
    code: row.code,
    name: row.name,
    capacity: row.capacity,
    sortOrder: row.sortOrder,
    status: row.status as DiningTableStatus,
    version: row.version,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}
export function tableCommandResponse(row: StoredTableCommand): DiningTableDto {
  if (
    row.status !== 'SUCCEEDED' ||
    !row.tableId ||
    !row.resultCode ||
    !row.resultName ||
    !row.resultStatus ||
    !row.resultVersion ||
    !row.resultCreatedAt ||
    !row.resultUpdatedAt ||
    row.resultCapacity === null ||
    row.resultSortOrder === null
  )
    throw new Error('Rezultatul comenzii mesei nu este complet.');
  return {
    id: row.tableId,
    locationId: row.locationId,
    code: row.resultCode,
    name: row.resultName,
    capacity: row.resultCapacity,
    sortOrder: row.resultSortOrder,
    status: row.resultStatus as DiningTableStatus,
    version: row.resultVersion,
    createdAt: row.resultCreatedAt.toISOString(),
    updatedAt: row.resultUpdatedAt.toISOString(),
  };
}
