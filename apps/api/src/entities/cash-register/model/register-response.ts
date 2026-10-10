import type { CashRegisterDto, CashRegisterStatus } from '@pos/contracts';
import type { StoredCashRegister, StoredRegisterCommand } from './register.types';
export function registerResponse(row: StoredCashRegister): CashRegisterDto {
  return {
    id: row.id,
    locationId: row.locationId,
    code: row.code,
    name: row.name,
    status: row.status as CashRegisterStatus,
    version: row.version,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}
export function registerCommandResponse(row: StoredRegisterCommand): CashRegisterDto {
  if (
    row.status !== 'SUCCEEDED' ||
    !row.registerId ||
    !row.resultCode ||
    !row.resultName ||
    !row.resultStatus ||
    !row.resultVersion ||
    !row.resultCreatedAt ||
    !row.resultUpdatedAt
  )
    throw new Error('Rezultatul comenzii casei nu este complet.');
  return {
    id: row.registerId,
    locationId: row.locationId,
    code: row.resultCode,
    name: row.resultName,
    status: row.resultStatus as CashRegisterStatus,
    version: row.resultVersion,
    createdAt: row.resultCreatedAt.toISOString(),
    updatedAt: row.resultUpdatedAt.toISOString(),
  };
}
