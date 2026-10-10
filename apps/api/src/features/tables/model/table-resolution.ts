import type { DiningTableResolutionResponse, DiningTableCommandIdentity } from '@pos/contracts';
import type { TenantTransaction } from '@pos/db';
import type { AccessData } from '../../../entities/tenant-access';
import { tableCommandResponse } from '../../../entities/dining-table';
import { requireTableAccess } from './table-access';
import { lockTable, readTableCommand } from './table-command';
export async function resolveTable(
  tx: TenantTransaction,
  access: AccessData,
  actor: string,
  identity: DiningTableCommandIdentity,
): Promise<DiningTableResolutionResponse> {
  requireTableAccess(access, actor, identity.locationId, true);
  const claim = await readTableCommand(tx, identity, actor);
  if (claim?.status === 'SUCCEEDED')
    return {
      status: 'SUCCEEDED',
      command: identity,
      result: { table: tableCommandResponse(claim) },
    };
  if (!claim) {
    if (identity.kind !== 'CREATE') await lockTable(tx, identity.locationId, identity.tableId!);
    await tx.diningTableCommand.create({
      data: {
        organizationId: access.org.id,
        locationId: identity.locationId,
        requestKey: identity.requestKey,
        kind: identity.kind,
        actorUserId: actor,
        status: 'RETIRED',
        tableId: identity.kind === 'CREATE' ? null : identity.tableId,
      },
    });
  }
  return { status: 'RETIRED', command: identity };
}
