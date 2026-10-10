import type { TenantTransaction } from '@pos/db';
import type {
  OrderResponsibilityCommandIdentity,
  OrderResponsibilityResolutionResponse,
} from '@pos/contracts/order-responsibilities';
import type { AccessData } from '../../../entities/tenant-access';
import { prepareResponsibility } from '../../../entities/order-responsibility';
import { responsibilityCommandAccess } from './responsibility-command-access';
import {
  readResponsibilityClaim,
  responsibilityTargets,
  responsibilityResult,
} from './responsibility-claims';
export async function resolveResponsibility(
  tx: TenantTransaction,
  access: AccessData,
  actor: string,
  command: OrderResponsibilityCommandIdentity,
): Promise<{ response: OrderResponsibilityResolutionResponse; retired: boolean }> {
  await responsibilityCommandAccess(tx, access, actor, command);
  let claim = await readResponsibilityClaim(tx, actor, command);
  const existing = async (): Promise<OrderResponsibilityResolutionResponse> =>
    claim!.status === 'SUCCEEDED'
      ? {
          status: 'SUCCEEDED',
          command,
          result: await responsibilityResult(tx, access, actor, claim!.resultEventId!),
        }
      : { status: 'RETIRED', command };
  if (claim) return { response: await existing(), retired: false };
  await tx.$queryRaw`SELECT id FROM "Order" WHERE "organizationId"=${access.org.id}::uuid AND "locationId"=${command.locationId}::uuid AND id=${command.orderId}::uuid FOR UPDATE`;
  claim = await readResponsibilityClaim(tx, actor, command);
  if (claim) return { response: await existing(), retired: false };
  const targets = responsibilityTargets(command);
  await prepareResponsibility(tx, access.org.id, command.locationId, command.orderId, [
    targets.sourceShiftId,
    targets.targetShiftId,
  ]);
  await tx.orderResponsibilityCommand.create({
    data: {
      organizationId: access.org.id,
      locationId: command.locationId,
      orderId: command.orderId,
      actorUserId: actor,
      requestKey: command.requestKey,
      kind: command.kind,
      ...targets,
      status: 'RETIRED',
    },
  });
  return { response: { status: 'RETIRED', command }, retired: true };
}
