import { randomUUID } from 'node:crypto';
import type { TenantTransaction } from '@pos/db';
import type {
  OrderResponsibilityCommandRequest,
  OrderResponsibilityCommandIdentity,
} from '@pos/contracts/order-responsibilities';
import type { AccessData } from '../../../entities/tenant-access';
import { prepareResponsibility } from '../../../entities/order-responsibility';
import { requestHash } from '../../../shared/lib/idempotency';
import { HttpError } from '../../../shared/lib/http';
import { responsibilityCommandAccess } from './responsibility-command-access';
import {
  readResponsibilityClaim,
  responsibilityConflict,
  responsibilityResult,
  responsibilityTargets,
} from './responsibility-claims';
import { validateResponsibilityTransition } from './responsibility-transition';
export async function executeResponsibility(
  tx: TenantTransaction,
  access: AccessData,
  actor: string,
  orderId: string,
  body: OrderResponsibilityCommandRequest,
) {
  const command = { ...body, orderId } as OrderResponsibilityCommandIdentity;
  await responsibilityCommandAccess(tx, access, actor, command);
  const hash = requestHash({ orderId, ...body });
  let claim = await readResponsibilityClaim(tx, actor, command);
  const replay = async () => {
    if (claim!.status === 'RETIRED')
      throw new HttpError(409, 'Tentativa a fost retrasă.', 'ORDER_RESPONSIBILITY_COMMAND_RETIRED');
    if (claim!.requestHash !== hash) responsibilityConflict();
    return {
      ...(await responsibilityResult(tx, access, actor, claim!.resultEventId!)),
      replayed: true,
    };
  };
  if (claim) return replay();
  await tx.$queryRaw`SELECT id FROM "Order" WHERE "organizationId"=${access.org.id}::uuid AND "locationId"=${body.locationId}::uuid AND id=${orderId}::uuid FOR UPDATE`;
  claim = await readResponsibilityClaim(tx, actor, command);
  if (claim) return replay();
  const targets = responsibilityTargets(command);
  await prepareResponsibility(tx, access.org.id, body.locationId, orderId, [
    targets.sourceShiftId,
    targets.targetShiftId,
  ]);
  const { order, shift } = await responsibilityCommandAccess(tx, access, actor, command);
  await validateResponsibilityTransition(tx, actor, order, shift, body);
  const eventId = randomUUID();
  await tx.orderResponsibilityEvent.create({
    data: {
      id: eventId,
      organizationId: access.org.id,
      locationId: body.locationId,
      orderId,
      version: body.responsibilityVersion + 1,
      previousVersion: body.responsibilityVersion,
      kind: body.kind,
      actorUserId: actor,
      orderVersion: body.orderVersion,
      requestKey: body.requestKey,
      reason: body.reason,
      managerReason: body.kind === 'PREPARE_HANDOFF' ? body.managerReason : null,
      ...targets,
    },
  });
  await tx.orderResponsibilityCommand.create({
    data: {
      organizationId: access.org.id,
      locationId: body.locationId,
      orderId,
      requestKey: body.requestKey,
      actorUserId: actor,
      kind: body.kind,
      ...targets,
      status: 'SUCCEEDED',
      requestHash: hash,
      resultEventId: eventId,
    },
  });
  return { ...(await responsibilityResult(tx, access, actor, eventId)), replayed: false };
}
