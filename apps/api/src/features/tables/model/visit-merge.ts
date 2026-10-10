import { randomUUID } from 'node:crypto';
import type { TableVisitCommandRequest, TableVisitCommandIdentity } from '@pos/contracts';
import type { TenantTransaction } from '@pos/db';
import type { AccessData } from '../../../entities/tenant-access';
import { visitEventResponse } from '../../../entities/table-visit';
import { HttpError } from '../../../shared/lib/http';
import { requestHash } from '../../../shared/lib/idempotency';
import { readVisit } from './visit-access';
import { replayVisit } from './visit-command';
export async function mergeVisit(
  tx: TenantTransaction,
  access: AccessData,
  actor: string,
  visitId: string,
  body: Extract<TableVisitCommandRequest, { kind: 'MERGED' }>,
) {
  const identity: TableVisitCommandIdentity = {
    locationId: body.locationId,
    requestKey: body.requestKey,
    kind: 'MERGED',
    visitId,
    targetVisitId: body.targetVisitId,
  };
  const hash = requestHash({ organizationId: access.org.id, actor, visitId, ...body });
  const previous = await replayVisit(tx, actor, identity, hash);
  if (previous) return { ...previous, replayed: true };
  const source = await readVisit(tx, body.locationId, visitId);
  const target = await readVisit(tx, body.locationId, body.targetVisitId);
  if (source.id === target.id || source.status !== 'OPEN' || target.status !== 'OPEN')
    throw new HttpError(
      409,
      'Unirea cere două vizite deschise distincte.',
      'TABLE_MERGE_UNAVAILABLE',
    );
  await tx.$executeRaw`SELECT public.prepare_table_visit_merge(${access.org.id}::uuid,${body.locationId}::uuid,${visitId}::uuid,${body.targetVisitId}::uuid)`;
  const currentSource = await readVisit(tx, body.locationId, visitId);
  const currentTarget = await readVisit(tx, body.locationId, body.targetVisitId);
  if (currentSource.version !== body.version || currentTarget.version !== body.targetVersion)
    throw new HttpError(
      409,
      'Una dintre vizite a fost modificată. Reîncărcați.',
      'TABLE_VISIT_VERSION_CONFLICT',
    );
  if (currentSource.guestCount + currentTarget.guestCount > 999)
    throw new HttpError(
      409,
      'Numărul total de persoane depășește limita.',
      'TABLE_MERGE_GUEST_LIMIT',
    );
  const sourceEventId = randomUUID();
  await tx.tableVisitMerge.create({
    data: {
      organizationId: access.org.id,
      locationId: body.locationId,
      requestKey: body.requestKey,
      requestHash: hash,
      sourceVisitId: visitId,
      targetVisitId: body.targetVisitId,
      sourceVersion: body.version,
      targetVersion: body.targetVersion,
      sourceEventId,
      targetEventId: randomUUID(),
      actorUserId: actor,
      reason: body.reason,
    },
  });
  return {
    event: visitEventResponse(
      await tx.tableVisitEvent.findUniqueOrThrow({ where: { id: sourceEventId } }),
    ),
    replayed: false,
  };
}
