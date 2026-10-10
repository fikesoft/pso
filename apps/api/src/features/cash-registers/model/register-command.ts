import type { TenantTransaction } from '@pos/db';
import { registerCommandResponse } from '../../../entities/cash-register';
import type { StoredCashRegister } from '../../../entities/cash-register';
import { HttpError, assert } from '../../../shared/lib/http';
import type { RegisterCommandIdentity } from './register-command.types';
export async function readRegisterCommand(
  tx: TenantTransaction,
  identity: RegisterCommandIdentity,
  actor: string,
) {
  const claim = await tx.cashRegisterCommand.findFirst({
    where: { locationId: identity.locationId, requestKey: identity.requestKey },
  });
  if (
    claim &&
    (claim.actorUserId !== actor ||
      claim.kind !== identity.kind ||
      (identity.kind !== 'CREATE' && claim.registerId !== identity.registerId))
  )
    throw new HttpError(
      409,
      'Cheia cererii aparține altei operațiuni.',
      'CASH_REGISTER_REQUEST_CONFLICT',
    );
  return claim;
}
export async function replayRegisterCommand(
  tx: TenantTransaction,
  identity: RegisterCommandIdentity,
  actor: string,
  hash: string,
) {
  const claim = await readRegisterCommand(tx, identity, actor);
  if (!claim) return null;
  if (claim.status === 'RETIRED')
    throw new HttpError(
      409,
      'Tentativa a fost retrasă. Inițiați o cerere nouă.',
      'CASH_REGISTER_REQUEST_RETIRED',
    );
  if (claim.requestHash !== hash)
    throw new HttpError(
      409,
      'Cheia cererii a fost folosită pentru alte date.',
      'CASH_REGISTER_REQUEST_CONFLICT',
    );
  return registerCommandResponse(claim);
}
export async function lockRegister(tx: TenantTransaction, locationId: string, id: string) {
  const rows = await tx.$queryRaw<Array<{ id: string }>>`
    SELECT id FROM "CashRegister" WHERE id=${id}::uuid AND "locationId"=${locationId}::uuid FOR UPDATE`;
  assert(rows.length === 1, 404, 'Casa nu există');
  return tx.cashRegister.findUniqueOrThrow({ where: { id } });
}
export async function saveRegisterCommand(
  tx: TenantTransaction,
  row: StoredCashRegister,
  identity: RegisterCommandIdentity,
  expectedVersion: number | null,
) {
  await tx.cashRegisterCommand.create({
    data: {
      organizationId: row.organizationId,
      locationId: row.locationId,
      requestKey: identity.requestKey,
      kind: identity.kind,
      actorUserId: row.updatedByUserId,
      status: 'SUCCEEDED',
      registerId: row.id,
      requestHash: row.lastRequestHash,
      expectedVersion,
      resultCode: row.code,
      resultName: row.name,
      resultStatus: row.status,
      resultVersion: row.version,
      resultCreatedAt: row.createdAt,
      resultUpdatedAt: row.updatedAt,
    },
  });
}
