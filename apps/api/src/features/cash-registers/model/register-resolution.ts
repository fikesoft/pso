import type { CashRegisterResolutionResponse } from '@pos/contracts';
import type { TenantTransaction } from '@pos/db';
import type { AccessData } from '../../../entities/tenant-access';
import { registerCommandResponse } from '../../../entities/cash-register';
import { requireRegisterAccess } from './register-access';
import { lockRegister, readRegisterCommand } from './register-command';
import type { RegisterCommandIdentity } from './register-command.types';
export async function resolveRegister(
  tx: TenantTransaction,
  access: AccessData,
  actor: string,
  identity: RegisterCommandIdentity,
): Promise<CashRegisterResolutionResponse> {
  requireRegisterAccess(access, actor, identity.locationId, true);
  const claim = await readRegisterCommand(tx, identity, actor);
  if (claim?.status === 'SUCCEEDED')
    return { status: 'SUCCEEDED', kind: identity.kind, register: registerCommandResponse(claim) };
  if (!claim) {
    if (identity.kind !== 'CREATE')
      await lockRegister(tx, identity.locationId, identity.registerId!);
    await tx.cashRegisterCommand.create({
      data: {
        organizationId: access.org.id,
        locationId: identity.locationId,
        requestKey: identity.requestKey,
        kind: identity.kind,
        actorUserId: actor,
        status: 'RETIRED',
        registerId: identity.registerId ?? null,
      },
    });
  }
  return {
    status: 'RETIRED',
    kind: identity.kind,
    locationId: identity.locationId,
    requestKey: identity.requestKey,
    registerId: identity.registerId ?? null,
  };
}
