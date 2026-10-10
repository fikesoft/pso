import type {
  KitchenStationResolutionResponse,
  KitchenStationCommandIdentity,
} from '@pos/contracts';
import type { TenantTransaction } from '@pos/db';
import type { AccessData } from '../../../entities/tenant-access';
import { stationCommandResponse } from '../../../entities/kitchen-station';
import { requireStationAccess } from './station-access';
import { lockStation, readStationCommand } from './station-command';
export async function resolveStation(
  tx: TenantTransaction,
  access: AccessData,
  actor: string,
  identity: KitchenStationCommandIdentity,
): Promise<KitchenStationResolutionResponse> {
  requireStationAccess(access, actor, identity.locationId, true);
  const claim = await readStationCommand(tx, identity, actor);
  if (claim?.status === 'SUCCEEDED')
    return {
      status: 'SUCCEEDED',
      command: identity,
      result: { station: stationCommandResponse(claim) },
    };
  if (!claim) {
    if (identity.kind !== 'CREATE') await lockStation(tx, identity.locationId, identity.stationId!);
    await tx.kitchenStationCommand.create({
      data: {
        organizationId: access.org.id,
        locationId: identity.locationId,
        requestKey: identity.requestKey,
        kind: identity.kind,
        actorUserId: actor,
        status: 'RETIRED',
        stationId: identity.kind === 'CREATE' ? null : identity.stationId,
      },
    });
  }
  return { status: 'RETIRED', command: identity };
}
